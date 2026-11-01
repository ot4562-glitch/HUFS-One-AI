"""#89 offline browser asset and preview-policy gate (synthetic build only).

Checks the compiled web bundle and public development config without touching
private student files. A positive result is NOT evidence of actual TLS/edge,
browser BFCache, service-worker cache state, or cross-tab session invalidation.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PERSISTENCE = (
    ("SERVICE_WORKER_REGISTER", re.compile(
        r"\b(?:navigator|window\.navigator|self\.navigator)\s*\??\.\s*serviceWorker"
        r"\s*\??\.\s*register\s*\(", re.I)),
    ("CACHE_STORAGE_ACCESS", re.compile(
        r"\b(?:globalThis\s*\.\s*)?(?:caches|CacheStorage)\s*\??\.\s*"
        r"(?:open|match|put|add|addAll|keys|delete)\s*\(", re.I)),
    ("CLIENT_PERSISTENT_STORAGE", re.compile(
        r"\b(?:localStorage|sessionStorage|indexedDB)\s*\??\.\s*"
        r"(?:setItem|open|put|add)\s*\(", re.I)),
    ("STORAGE_PERSIST_REQUEST", re.compile(
        r"\bnavigator\s*\.\s*storage\s*\.\s*persist\s*\(", re.I)),
)
WORKER_FILENAMES = re.compile(
    r"^(?:sw|service-worker|ngsw-worker|workbox[-.].*|firebase-messaging-sw)"
    r"(?:\.[\w-]+)*\.(?:js|mjs)$", re.I)
CALLS = {
    "resume": re.compile(r"\battachDemoResumeRevalidation\s*\("),
    "broadcast": re.compile(r"\battachCrossTabSessionClosure\s*\("),
}
PUBLIC_SUFFIXES = frozenset({".js", ".mjs", ".html", ".css", ".json"})
MAX_ASSET = 10_000_000


def _asset_hash(name: str) -> str:
    return hashlib.sha256(name.encode("utf-8", "surrogatepass")).hexdigest()[:16]


def _safe_code(code: str, asset: str | None = None) -> dict:
    return {"reason": code, "artifact_hash": _asset_hash(asset) if asset else None}


def _source_calls(source: str) -> str:
    """Suppress import-only and comment-only claims, not a runtime proof."""
    without_blocks = re.sub(r"/\*[\s\S]*?\*/", "", source)
    return "\n".join(
        line.partition("//")[0] for line in without_blocks.splitlines()
    )


def audit_browser_surface(root: Path = ROOT) -> dict:
    root = Path(root)
    findings: list[dict] = []
    blocked: list[str] = []
    inspected = 0

    def fail(reason: str, path: str | None = None) -> None:
        findings.append(_safe_code(reason, path))

    dist = root / "dist/web"
    if not dist.is_dir() or dist.is_symlink():
        fail("PUBLIC_BUILD_MISSING_OR_SYMLINK")
    else:
        index = dist / "index.html"
        if not index.is_file() or index.is_symlink():
            fail("PUBLIC_HTML_MISSING", "web/index.html")
        for artifact in dist.rglob("*"):
            if not (artifact.is_file() or artifact.is_symlink()):
                continue
            relative = artifact.relative_to(dist).as_posix()
            if artifact.is_symlink():
                fail("SYMLINK_IN_PUBLIC_BUNDLE", relative)
                continue
            if WORKER_FILENAMES.fullmatch(artifact.name):
                fail("UNREVIEWED_SERVICE_WORKER_FILE", relative)
            if artifact.name.endswith((".map", ".ts", ".tsx")):
                fail("PUBLIC_SOURCE_OR_SOURCEMAP", relative)
            if artifact.suffix.casefold() not in PUBLIC_SUFFIXES:
                continue
            inspected += 1
            if artifact.stat().st_size > MAX_ASSET:
                fail("PUBLIC_ASSET_TOO_LARGE_TO_INSPECT", relative)
                continue
            try:
                body = artifact.read_text(encoding="utf-8-sig")
            except (UnicodeError, OSError):
                fail("PUBLIC_TEXT_UNREADABLE", relative)
                continue
            for code, pattern in PERSISTENCE:
                if pattern.search(body):
                    fail(code, relative)
            if artifact.suffix == ".html" and re.search(
                r"<link\b[^>]*\brel\s*=\s*['\"]manifest['\"]",
                body, re.I
            ):
                fail("UNREVIEWED_OFFLINE_MANIFEST", relative)

    vite = root / "apps/web/vite.config.ts"
    if not vite.is_file() or vite.is_symlink():
        fail("VITE_DEV_PREVIEW_POLICY_MISSING")
    else:
        config = vite.read_text(encoding="utf-8")
        # The reviewed local-only development config has separate dev and
        # preview loopback bindings, no sourcemaps or remote proxy target.
        if len(re.findall(r"\bhost\s*:\s*['\"]127\.0\.0\.1['\"]", config)) != 2:
            fail("DEV_OR_PREVIEW_NON_LOOPBACK")
        if not re.search(r"\bsourcemap\s*:\s*false\b", config):
            fail("PUBLIC_SOURCEMAPS_NOT_DISABLED")
        if not re.search(r"\bemptyOutDir\s*:\s*true\b", config):
            fail("BUILD_OUTPUT_NOT_CLEANED")
        if not re.search(
            r"\btarget\s*:\s*['\"]http://127\.0\.0\.1:3000['\"]", config
        ) or not re.search(r"\bchangeOrigin\s*:\s*false\b", config):
            fail("UNREVIEWED_DEV_API_PROXY")

    # Main mounts App(controller), App uses useDemo(controller), and the hook
    # installs browser effects. Checking main/App alone was a FALSE BLOCKER:
    # current main's useDemo.ts already wires both listeners. Static source
    # checks prove neither actual event delivery nor BFCache invalidation.
    entrypoints = {
        "main": root / "apps/web/src/main.tsx",
        "app": root / "apps/web/src/App.tsx",
        "hook": root / "apps/web/src/shell/useDemo.ts",
    }
    sources: dict[str, str] = {}
    for key, path in entrypoints.items():
        if not path.is_file() or path.is_symlink():
            blocked.append("CLIENT_ENTRYPOINT_UNAVAILABLE")
            continue
        sources[key] = _source_calls(path.read_text(encoding="utf-8"))

    main = sources.get("main", "")
    app = sources.get("app", "")
    hook = sources.get("hook", "")
    if not (re.search(r"<App\\b[^>]*\\bcontroller\\s*=\\s*\\{\\s*controller\\s*\\}", main)
            and re.search(r"\\buseDemo\\s*\\(\\s*controller\\s*\\)", app)):
        blocked.append("MOUNTED_REACT_SESSION_HOOK_NOT_PROVEN")
    if not (CALLS["resume"].search(hook)
            and re.search(r"\\buseEffect\\s*\\(\\s*\\(\\s*\\)\\s*=>\\s*"
                          r"attachDemoResumeRevalidation\\s*\\(", hook)):
        blocked.append("RESUME_LISTENER_NOT_WIRED")
    if not (CALLS["broadcast"].search(hook)
            and re.search(r"\\bnew\\s+BroadcastChannel\\s*\\(\\s*SESSION_CLOSE_CHANNEL\\s*\\)", hook)
            and re.search(r"\\bdetach\\s*\\(\\s*\\)", hook)
            and re.search(r"\\bchannel\\s*\\.\\s*close\\s*\\(\\s*\\)", hook)):
        blocked.append("CROSS_TAB_CLOSE_NOT_WIRED")

    static_status = "FAIL" if findings else "PASS"
    # Even when call sites appear, a real browser is still required; source
    # inspection alone never promotes lifecycle to PASS.
    wiring_status = "BLOCKED" if blocked else "NOT_RUN"
    return {
        "release": "BLOCKED", "releaseDecision": "RELEASE_BLOCKED",
        "gates": [
            {"name": "compiled_browser_cache_and_loopback_preview",
             "status": static_status, "assets_examined": inspected},
            {"name": "browser_session_lifecycle_wiring",
             "status": wiring_status, "wiring_detected": not bool(blocked),
             "reason_codes": sorted(set(blocked))},
            {"name": "actual_bfcache_cross_tab_and_service_worker",
             "status": "NOT_RUN"},
            {"name": "live_authenticated_edge_and_cdn_cache_headers",
             "status": "NOT_RUN"},
        ],
        "findings": findings,
        "scope": "Only synthetic compiled web assets and public source/config metadata",
    }


if __name__ == "__main__":
    report = audit_browser_surface()
    print(json.dumps(report, ensure_ascii=True, separators=(",", ":")))
    # Ordinary PR CI rejects unsafe compiled assets. Source call-path inspection
    # is advisory; real tab/BFCache and external release checks remain NOT_RUN.
    sys.exit(1 if report["gates"][0]["status"] == "FAIL" else 0)
