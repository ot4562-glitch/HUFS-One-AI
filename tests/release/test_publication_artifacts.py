"""Synthetic-only negative fixtures for compiled-publication security checks."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tools.release_publication_gate import DOCKER_EXCLUSIONS, audit_publication_artifacts


class PublicationGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="synthetic-release-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self._write("dist/web/index.html", "<!doctype html><title>Synthetic</title>")
        self._write("dist/apps/api/src/server.js", "export const synthetic=true;")
        self._write(".dockerignore", "\n".join(sorted(DOCKER_EXCLUSIONS)) + "\n")
        self._write(".github/workflows/task00-contracts.yml",
                    "on:\n  pull_request:\npermissions:\n  contents: read\n")

    def _write(self, name: str, text: str) -> None:
        file = self.root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text, encoding="utf-8")

    def _codes(self) -> set[str]:
        return {entry["reason"] for entry in audit_publication_artifacts(self.root)["findings"]}

    def test_synthetic_compiled_fixtures_pass_without_authorizing_release(self) -> None:
        report = audit_publication_artifacts(self.root)
        self.assertEqual(report["gates"][0]["status"], "PASS")
        self.assertEqual(report["release"], "BLOCKED")
        self.assertEqual(report["releaseDecision"], "RELEASE_BLOCKED")
        self.assertEqual([gate["status"] for gate in report["gates"][1:]],
                         ["NOT_RUN", "NOT_RUN", "NOT_RUN"])
        self.assertEqual(report["gates"][0]["files_checked"], 2)

    def test_raw_csv_and_credentials_in_output_are_rejected(self) -> None:
        self._write("dist/web/csv/synthetic.csv", "synthetic,not-personal\n")
        self._write("dist/web/assets/.env.production", "NOT_A_REAL_KEY=synthetic\n")
        self.assertIn("PRIVATE_OR_CREDENTIAL_FILE_IN_BUILD", self._codes())

    def test_compiled_secret_pattern_is_rejected_without_leaking_value(self) -> None:
        fake_marker = "-----BEGIN " + "PRIVATE KEY-----"
        self._write("dist/web/assets/app.js", "export default " + repr(fake_marker) + ";")
        report = audit_publication_artifacts(self.root)
        self.assertIn("CREDENTIAL_SIGNATURE_IN_BUILD", self._codes())
        serialized = json.dumps(report)
        self.assertNotIn(fake_marker, serialized)
        self.assertNotIn("assets/app.js", serialized)

    def test_public_javascript_sourcemap_is_rejected(self) -> None:
        self._write("dist/web/assets/synthetic.js.map", '{"sources":[]}')
        self.assertIn("UNREVIEWED_PUBLIC_SOURCE_OR_HIDDEN_FILE", self._codes())

    def test_missing_build_outputs_cannot_be_reported_pass(self) -> None:
        (self.root / "dist/web/index.html").unlink()
        self.assertIn("EXPECTED_BUILD_FILE_MISSING", self._codes())

    def test_docker_context_must_exclude_private_sources(self) -> None:
        self._write(".dockerignore", ".git\nnode_modules\n")
        self.assertIn("DOCKER_CONTEXT_PRIVATE_EXCLUSION_MISSING", self._codes())

    def test_workflow_artifact_upload_or_privileged_event_is_rejected(self) -> None:
        for unsafe in (
            "steps:\n  - uses: actions/upload-artifact@v4\n",
            "on:\n  pull_request_target:\n",
            "permissions:\n  id-token: write\n",
        ):
            with self.subTest(unsafe=unsafe[:20]):
                self._write(".github/workflows/task00-contracts.yml", unsafe)
                self.assertIn("CI_PRIVILEGED_OR_ARTIFACT_EGRESS", self._codes())

    def test_dockerignore_negation_cannot_reinclude_private_paths(self) -> None:
        for unsafe in ("!csv/**", "!local_only/**", "!private/**", "!**/secrets/*"):
            with self.subTest(unsafe=unsafe):
                self._write(".dockerignore",
                            "\n".join(sorted(DOCKER_EXCLUSIONS)) + "\n" + unsafe + "\n")
                self.assertIn("DOCKER_CONTEXT_UNREVIEWED_REINCLUSION", self._codes())

    def test_commented_negations_are_not_inclusion_rules(self) -> None:
        self._write(".dockerignore",
                    "\n".join(sorted(DOCKER_EXCLUSIONS)) + "\n# !csv/** ignored\n")
        self.assertNotIn("DOCKER_CONTEXT_UNREVIEWED_REINCLUSION", self._codes())

    def test_dockerfile_specific_ignore_override_is_blocked(self) -> None:
        self._write("apps/api/Dockerfile.dockerignore", "**/*\n!csv/**\n")
        report = audit_publication_artifacts(self.root)
        self.assertIn("DOCKERFILE_SPECIFIC_IGNORE_UNREVIEWED", self._codes())
        output = json.dumps(report, ensure_ascii=True)
        self.assertNotIn("apps/api/Dockerfile.dockerignore", output)

    def test_non_web_sourcemap_must_never_be_in_release_artifact(self) -> None:
        for name in ("dist/apps/api/src/server.js.map",
                     "dist/packages/contracts/index.css.map",
                     "dist/apps/api/src/server.MAP"):
            with self.subTest(name=name):
                self._write(name, '{"sources":["secret.ts"]}')
                self.assertIn("UNREVIEWED_API_OR_SERVER_SOURCEMAP", self._codes())
                (self.root / name).unlink()

    def test_inline_or_external_source_mapping_reference_is_rejected(self) -> None:
        for content in (
            "//# sourceMappingURL=server.js.map",
            "/*# sourceMappingURL=data:application/json;base64,ZmFrZQ== */",
            "//@ sourceMappingURL=https://not-approved.example.test/server.map",
        ):
            with self.subTest(content=content[:25]):
                self._write("dist/apps/api/src/server.js",
                            "export const synthetic=true;\n" + content + "\n")
                self.assertIn("PUBLIC_OR_SERVER_SOURCEMAP_REFERENCE", self._codes())

    def test_rejection_report_never_echoes_private_pseudopath(self) -> None:
        marker = "private-synthetic-only-candidate"
        self._write("dist/apps/api/src/" + marker + ".js.map",
                    '{"sources":["./synthetic-private-source.ts"]}')
        result = json.dumps(audit_publication_artifacts(self.root))
        self.assertNotIn(marker, result)
        self.assertNotIn("synthetic-private-source", result)
        self.assertIn("UNREVIEWED_API_OR_SERVER_SOURCEMAP", result)

    def test_generated_artifact_links_are_rejected(self) -> None:
        target = self.root / "dist/web/index.html"
        link = self.root / "dist/web/assets/synthetic.js"
        link.parent.mkdir(parents=True, exist_ok=True)
        try:
            link.symlink_to(target)
        except OSError as error:
            self.skipTest("symlinks unavailable in this runner: " + type(error).__name__)
        self.assertIn("SYMLINK_IN_BUILD", self._codes())


if __name__ == "__main__":
    unittest.main()
