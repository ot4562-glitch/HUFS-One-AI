"""Negative synthetic tests for offline browser cache/session release boundary."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tools.verify_browser_release_surface import audit_browser_surface

SYNTHETIC_CONFIG = """\
export default {
  server: {host: '127.0.0.1', port: 5173,
    proxy: {'/api': {target: 'http://127.0.0.1:3000', changeOrigin: false}}},
  preview: {host: '127.0.0.1', port: 4173},
  build: {outDir: '../../dist/web', emptyOutDir: true, sourcemap: false},
}
"""


class BrowserSurfaceGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="synthetic-browser-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.write("dist/web/index.html",
                   "<!doctype html><title>Synthetic</title>")
        self.write("dist/web/assets/index.js", "export const synthetic = true;")
        self.write("apps/web/vite.config.ts", SYNTHETIC_CONFIG)
        self.write("apps/web/src/main.tsx",
                   "const controller = new DemoController(client, 'SYN');")
        self.write("apps/web/src/App.tsx", "export const App = () => null;")

    def write(self, name: str, value: str) -> None:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")

    def audit(self) -> dict:
        return audit_browser_surface(self.root)

    def codes(self) -> set[str]:
        return {item["reason"] for item in self.audit()["findings"]}

    def test_synthetic_build_passes_static_scan_but_release_remains_blocked(self) -> None:
        report = self.audit()
        self.assertEqual(report["gates"][0]["status"], "PASS")
        self.assertEqual(report["gates"][0]["assets_examined"], 2)
        self.assertEqual(report["release"], "BLOCKED")
        self.assertEqual(report["releaseDecision"], "RELEASE_BLOCKED")
        self.assertEqual(report["gates"][1]["status"], "BLOCKED")
        self.assertEqual(report["gates"][1]["reason_codes"], [
            "CROSS_TAB_CLOSE_NOT_WIRED", "RESUME_LISTENER_NOT_WIRED"
        ])
        self.assertEqual([gate["status"] for gate in report["gates"][2:]],
                         ["NOT_RUN", "NOT_RUN"])

    def test_declared_helpers_without_calls_do_not_count_as_wired(self) -> None:
        self.write("apps/web/src/main.tsx",
                   "// attachDemoResumeRevalidation(controller)\n"
                   "import {attachCrossTabSessionClosure} from './app/index.js';\n"
                   "/* attachCrossTabSessionClosure(controller, channel) */")
        self.assertEqual(self.audit()["gates"][1]["status"], "BLOCKED")

    def test_call_sites_still_cannot_be_claimed_as_live_browser_verified(self) -> None:
        self.write("apps/web/src/main.tsx",
                   "attachDemoResumeRevalidation(controller, ports);\n"
                   "attachCrossTabSessionClosure(controller, channel);\n")
        self.assertEqual(self.audit()["gates"][1]["status"], "NOT_RUN")
        self.assertEqual(self.audit()["release"], "BLOCKED")

    def test_service_worker_files_are_rejected(self) -> None:
        for name in ("sw.js", "service-worker.js", "workbox-123.js"):
            with self.subTest(name=name):
                path = self.root / "dist/web" / name
                self.write("dist/web/" + name, "self.addEventListener('fetch', () => {});")
                self.assertIn("UNREVIEWED_SERVICE_WORKER_FILE", self.codes())
                path.unlink()

    def test_service_worker_registration_is_rejected(self) -> None:
        self.write("dist/web/assets/index.js",
                   "navigator.serviceWorker.register('/sw.js');")
        self.assertIn("SERVICE_WORKER_REGISTER", self.codes())

    def test_offline_data_persistence_apis_fail_closed(self) -> None:
        samples = {
            "CACHE_STORAGE_ACCESS": "caches.open('private');",
            "CLIENT_PERSISTENT_STORAGE": "localStorage.setItem('subject','S01');",
            "INDEXED_DB": "indexedDB.open('private');",
            "STORAGE_PERSIST_REQUEST": "navigator.storage.persist();",
        }
        for name, data in samples.items():
            with self.subTest(name=name):
                self.write("dist/web/assets/index.js", data)
                code = ("CLIENT_PERSISTENT_STORAGE" if name == "INDEXED_DB"
                        else name)
                self.assertIn(code, self.codes())

    def test_browser_manifest_is_rejected_before_review(self) -> None:
        self.write("dist/web/index.html",
                   '<!doctype html><link rel="manifest" href="/manifest.webmanifest">')
        self.assertIn("UNREVIEWED_OFFLINE_MANIFEST", self.codes())

    def test_public_source_map_cannot_pass_as_private(self) -> None:
        self.write("dist/web/assets/index.js.map", '{"sources":[]}')
        self.assertIn("PUBLIC_SOURCE_OR_SOURCEMAP", self.codes())

    def test_preview_and_dev_must_remain_loopback_only(self) -> None:
        for config in (
            SYNTHETIC_CONFIG.replace("host: '127.0.0.1'", "host: '0.0.0.0'", 1),
            SYNTHETIC_CONFIG.replace("host: '127.0.0.1'", "host: '::'", 1),
        ):
            with self.subTest(config=config[:44]):
                self.write("apps/web/vite.config.ts", config)
                self.assertIn("DEV_OR_PREVIEW_NON_LOOPBACK", self.codes())

    def test_sourcemaps_and_build_cleaning_are_required(self) -> None:
        for bad, expected in (
            (SYNTHETIC_CONFIG.replace("sourcemap: false", "sourcemap: true"),
             "PUBLIC_SOURCEMAPS_NOT_DISABLED"),
            (SYNTHETIC_CONFIG.replace("emptyOutDir: true", "emptyOutDir: false"),
             "BUILD_OUTPUT_NOT_CLEANED"),
        ):
            with self.subTest(expected=expected):
                self.write("apps/web/vite.config.ts", bad)
                self.assertIn(expected, self.codes())

    def test_unreviewed_public_api_proxy_is_rejected(self) -> None:
        self.write("apps/web/vite.config.ts",
                   SYNTHETIC_CONFIG.replace("http://127.0.0.1:3000",
                                            "https://unapproved.example.test"))
        self.assertIn("UNREVIEWED_DEV_API_PROXY", self.codes())

    def test_no_secret_or_bundle_source_printed_on_failure(self) -> None:
        self.write("dist/web/assets/index.js",
                   "window.localStorage.setItem('synthetic-private-sentinel','secret-test');"
                   "caches.open('synthetic-secret-data');")
        output = json.dumps(self.audit(), sort_keys=True)
        self.assertIn("CACHE_STORAGE_ACCESS", output)
        self.assertNotIn("synthetic-private-sentinel", output)
        self.assertNotIn("secret-test", output)
        self.assertNotIn("assets/index.js", output)

    def test_missing_build_can_never_be_a_static_pass(self) -> None:
        (self.root / "dist/web/index.html").unlink()
        self.assertIn("PUBLIC_HTML_MISSING", self.codes())

    def test_no_build_is_detected_instead_of_skipped(self) -> None:
        (self.root / "dist/web/index.html").unlink()
        (self.root / "dist/web/assets/index.js").unlink()
        (self.root / "dist/web/assets").rmdir()
        (self.root / "dist/web").rmdir()
        self.assertIn("PUBLIC_BUILD_MISSING_OR_SYMLINK", self.codes())


if __name__ == "__main__":
    unittest.main()
