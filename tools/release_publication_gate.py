"""#46 offline CI publication audit. Never inspect private input directories.

Only compiled output from this synthetic checkout is read. Finding records are
reason codes and *hashed* artifact path identifiers, never file data, tokens or
student filenames. Git history/consent cannot be proven by this scanner.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

REQUIRED_OUTPUTS = ("web/index.html", "apps/api/src/server.js")
FORBIDDEN_PARTS = frozenset({
    "csv", "local_only", "private", "secrets", "credentials",
    "student_records", "real5", "forms_raw", "private_identity_map",
    "backups", "exports",
})
FORBIDDEN_EXTENSIONS = frozenset({
    ".csv", ".xls", ".xlsx", ".db", ".sqlite", ".sqlite3", ".dump",
    ".key", ".pem", ".pfx", ".p12", ".log", ".jsonl", ".zip", ".7z",
})
DOCKER_EXCLUSIONS = frozenset({
    ".git", "local_only", "private", "secrets", "csv/",
    "templates/real5-intake/*.csv", "reference/hufsability",
    "data/real5", "packages/fixtures/real5", ".env", ".env.*",
})
TEXT_EXTENSIONS = frozenset({
    ".js", ".mjs", ".cjs", ".css", ".html", ".json", ".map", ".txt",
    ".xml", ".svg", ".wasm.map",
})
SIGNATURES = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{35,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"sk-(?:proj-)?[A-Za-z0-9_-]{35,}"),
)
MAX_SCAN_BYTES = 8_000_000


def _identifier(relative: str) -> str:
    return hashlib.sha256(relative.encode("utf-8", "surrogatepass")).hexdigest()[:16]


def audit_publication_artifacts(root: Path) -> dict:
    """Check only dist/** plus two *policy* files; never open repository raw data."""
    root = Path(root)
    dist = root / "dist"
    findings: list[dict] = []
    counted = 0
    scanned = 0

    def report(code: str, relative: str = "") -> None:
        findings.append({
            "reason": code,
            "artifact_hash": _identifier(relative) if relative else None,
        })

    if not dist.is_dir() or dist.is_symlink():
        report("BUILD_OUTPUT_MISSING_OR_SYMLINK")
    else:
        for relative in REQUIRED_OUTPUTS:
            path = dist / relative
            if not path.is_file() or path.is_symlink():
                report("EXPECTED_BUILD_FILE_MISSING", relative)
        for path in dist.rglob("*"):
            if not (path.is_file() or path.is_symlink()):
                continue
            relative = path.relative_to(dist).as_posix()
            counted += 1
            parts = [x.casefold() for x in path.relative_to(dist).parts]
            name = path.name.casefold()
            if path.is_symlink():
                report("SYMLINK_IN_BUILD", relative)
                continue
            if (any(part in FORBIDDEN_PARTS or part.startswith(".env") for part in parts)
                or path.suffix.casefold() in FORBIDDEN_EXTENSIONS
                or name.startswith(".env")):
                report("PRIVATE_OR_CREDENTIAL_FILE_IN_BUILD", relative)
                continue
            if relative.startswith("web/") and (
                name.endswith((".map", ".ts", ".tsx")) or name.startswith(".")
            ):
                report("UNREVIEWED_PUBLIC_SOURCE_OR_HIDDEN_FILE", relative)
                continue
            # API/server bundles can also be copied into Docker layers or
            # uploaded accidentally. A source map there exposes the original
            # TypeScript even if the React bundle itself has no sourcemaps.
            if name.endswith((".map", ".js.map", ".css.map")):
                report("UNREVIEWED_API_OR_SERVER_SOURCEMAP", relative)
                continue
            if path.suffix.casefold() not in TEXT_EXTENSIONS:
                continue
            if path.stat().st_size > MAX_SCAN_BYTES:
                report("TEXT_ARTIFACT_TOO_LARGE_TO_AUDIT", relative)
                continue
            try:
                data = path.read_text(encoding="utf-8-sig")
            except (UnicodeError, OSError):
                report("TEXT_ARTIFACT_UNREADABLE", relative)
                continue
            scanned += 1
            if re.search(r"(?m)//[#@]\s*sourceMappingURL=|/\*[#@]\s*sourceMappingURL=", data):
                # Includes inline data: maps, or references to external maps.
                report("PUBLIC_OR_SERVER_SOURCEMAP_REFERENCE", relative)
            if any(pattern.search(data) for pattern in SIGNATURES):
                report("CREDENTIAL_SIGNATURE_IN_BUILD", relative)

    docker = root / ".dockerignore"
    if not docker.is_file() or docker.is_symlink():
        report("DOCKERIGNORE_POLICY_MISSING")
    else:
        lines = {
            line.strip() for line in docker.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
        if not DOCKER_EXCLUSIONS.issubset(lines):
            report("DOCKER_CONTEXT_PRIVATE_EXCLUSION_MISSING")
        # .dockerignore uses last-match-wins semantics: a later !csv/** or
        # !local_only/** makes the mere presence of required exclusions
        # insufficient. No re-inclusion is approved for private builds.
        if any(line.startswith("!") for line in lines):
            report("DOCKER_CONTEXT_UNREVIEWED_REINCLUSION")
        # Dockerfile-specific ignores can override the root policy. Only
        # inspect filenames under the already reviewed synthetic checkout
        # roots; never recurse into raw student, local_only, or dist data.
        for safe_root in ("apps", "infra/compose", "packages"):
            safe_dir = root / safe_root
            if safe_dir.is_dir() and not safe_dir.is_symlink():
                for override in safe_dir.rglob("*.dockerignore"):
                    if override.is_file() or override.is_symlink():
                        report("DOCKERFILE_SPECIFIC_IGNORE_UNREVIEWED",
                               override.relative_to(root).as_posix())

    workflow = root / ".github/workflows/task00-contracts.yml"
    if not workflow.is_file() or workflow.is_symlink():
        report("WORKFLOW_POLICY_MISSING")
    else:
        text = workflow.read_text(encoding="utf-8")
        if (re.search(r"(?m)^\s+pull_request_target:", text)
            or re.search(r"actions/upload-artifact\s*@", text, re.I)
            or "secrets." in text or "id-token: write" in text):
            report("CI_PRIVILEGED_OR_ARTIFACT_EGRESS")

    status = "FAIL" if findings else "PASS"
    return {
        "release": "BLOCKED", "releaseDecision": "RELEASE_BLOCKED",
        "gates": [
            {"name": "offline_compiled_publication", "status": status,
             "files_checked": counted, "text_scanned": scanned},
            {"name": "historical_student_files_and_consent", "status": "NOT_RUN"},
            {"name": "real_ci_artifact_and_third_party_retention", "status": "NOT_RUN"},
            {"name": "external_storage_cdn_and_infra", "status": "NOT_RUN"},
        ],
        "findings": findings,
        "scope": "Only synthetic checked-out build outputs; no raw student file inspection",
    }


if __name__ == "__main__":
    report = audit_publication_artifacts(Path(__file__).resolve().parent.parent)
    print(json.dumps(report, separators=(",", ":"), ensure_ascii=True))
    if report["gates"][0]["status"] == "FAIL":
        sys.exit(1)
