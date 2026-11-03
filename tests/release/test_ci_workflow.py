"""Fail-closed checks for the PR workflow configuration; synthetic files only.

This is a targeted configuration contract, not a general YAML parser or a release
approval. It deliberately rejects new checkout paths until explicitly reviewed.
"""
from __future__ import annotations

import re
import json
import unittest
from pathlib import Path


WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/task00-contracts.yml"
# Resolved 2026-11-01 from the official actions/* refs/tags/v4 Git objects.
# Require full commit identity, not a mutable tag, branch or unreviewed action.
PINNED_CHECKOUT = "actions/checkout@11d5960a326750d5838078e36cf38b85af677262"
PINNED_SETUP_NODE = "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"
SAFE_SPARSE_PATHS = frozenset({
    "/package.json", "/package-lock.json", "/tsconfig.json", "/vitest.config.ts",
    "/packages/contracts/", "/packages/ai/src/", "/packages/fixtures/synthetic/",
    "/packages/fixtures/negative/", "/packages/core/", "/apps/api/",
    "/packages/ui/", "/tools/audit_private_git_metadata.py",
    "/tools/private_registry_io.mjs",
    "/tools/strip_build_sourcemaps.mjs",
    "/tools/prune_merged_branches.mjs",
    "/tools/tests/prune-merged-branches.node.mjs",
    "/apps/web/", "/infra/sql/", "/infra/ai/", "/infra/ncp/", "/tests/contracts/", "/tests/consumers/",
    "/tests/api/", "/tests/integration/", "/tests/e2e/", "/tests/evaluation/",
    "/tests/security/", "/tests/release/", "/tools/release_entrypoint_gate.mjs",
    "/tools/release_publication_gate.py", "/.dockerignore",
    "/tools/release_readiness_gate.py",
    "/tools/verify_browser_release_surface.py",
    "/tools/verify_release_boundary.py",
    "/.github/workflows/release-readiness.yml",
    "/.github/workflows/task00-contracts.yml",
    "/.github/workflows/ui-browser-e2e.yml",
})
EXCLUDED_DIRECTORIES = (
    "csv", "local_only", "templates/real5-intake", "reference/hufsability/raw",
)


def sparse_checkout_lists(text: str) -> list[list[str]]:
    lines = text.splitlines()
    lists = []
    for index, line in enumerate(lines):
        if line.strip() != "sparse-checkout: |":
            continue
        indent = len(line) - len(line.lstrip())
        paths = []
        for entry in lines[index + 1:]:
            if not entry.strip():
                continue
            if len(entry) - len(entry.lstrip()) <= indent:
                break
            paths.append(entry.strip())
        lists.append(paths)
    return lists


def audit_ci_boundary(text: str) -> list[str]:
    issues = []
    lines = text.splitlines()
    if "on:" not in lines or "  pull_request:" not in lines:
        issues.append("missing pull_request event")
    else:
        start = lines.index("  pull_request:")
        for line in lines[start + 1:]:
            if line.strip() and len(line) - len(line.lstrip()) <= 2:
                break
            if line.strip() and not line.lstrip().startswith("#"):
                issues.append("pull_request must have no branch/path/type filters")
                break

    if "  push:" not in lines or "    branches: [main]" not in lines:
        issues.append("main push verification missing")
    if re.search(r"(?m)^  pull_request_target:", text):
        issues.append("privileged pull_request_target is forbidden")
    if "permissions:\n  contents: read\n\njobs:" not in text:
        issues.append("workflow must grant only contents: read")
    if "secrets." in text or "id-token: write" in text:
        issues.append("workflow must not consume secrets or mint OIDC tokens")
    if "  synthetic-contracts:" not in lines or "  postgres-integration:" not in lines:
        issues.append("synthetic and disposable PostgreSQL jobs must be separate")

    actions = re.findall(r"(?m)^\s*(?:-\s*)?uses:\s*(\S+)", text)
    if (len(actions) != 4 or actions.count(PINNED_CHECKOUT) != 2
        or actions.count(PINNED_SETUP_NODE) != 2):
        issues.append("only reviewed commit-pinned checkout and setup-node are permitted")
    checkouts = text.count("uses: " + PINNED_CHECKOUT)
    if checkouts != 2 or text.count("persist-credentials: false") != checkouts:
        issues.append("each checkout must disable credential persistence")
    if checkouts != 2 or text.count("sparse-checkout-cone-mode: false") != checkouts:
        issues.append("each checkout must retain explicit sparse rules")
    sparse = sparse_checkout_lists(text)
    if len(sparse) != 2:
        issues.append("both jobs need sparse checkout")
    else:
        for index, paths in enumerate(sparse):
            if not paths or len(paths) != len(set(paths)):
                issues.append(f"checkout {index} has empty/duplicate entries")
            if not set(paths).issubset(SAFE_SPARSE_PATHS):
                issues.append(f"checkout {index} exceeds reviewed synthetic paths")
        if not {
            "/tests/release/", "/tests/security/",
            "/packages/ui/", "/tools/audit_private_git_metadata.py",
            "/tools/private_registry_io.mjs",
            "/tools/strip_build_sourcemaps.mjs",
            "/tools/prune_merged_branches.mjs",
            "/tools/tests/prune-merged-branches.node.mjs",
            "/.github/workflows/task00-contracts.yml",
            "/.github/workflows/ui-browser-e2e.yml",
            "/tools/release_entrypoint_gate.mjs",
            "/tools/release_publication_gate.py",
            "/.dockerignore",
            "/tools/release_readiness_gate.py",
            "/tools/verify_browser_release_surface.py",
            "/tools/verify_release_boundary.py",
            "/.github/workflows/release-readiness.yml",
        }.issubset(sparse[0]):
            issues.append("synthetic job omits release policy tests or workflow")
        if "/infra/sql/" not in sparse[1] or "/tests/api/" not in sparse[1]:
            issues.append("disposable PostgreSQL checkout lacks tests/migrations")

    for directory in EXCLUDED_DIRECTORIES:
        if text.count(f"test ! -d {directory}") != 2:
            issues.append(f"both jobs must assert absence of {directory}")
    if "python3 -m unittest discover -s tests/release" not in text:
        issues.append("release policy regression tests must execute in CI")
    if "node --test tests/security/*.test.mjs" not in text:
        issues.append("security negative regression tests must execute in CI")
    if "node --test tools/tests/prune-merged-branches.node.mjs" not in text:
        issues.append("branch cleanup fail-closed tests must execute in CI")
    if "node tools/release_entrypoint_gate.mjs" not in text:
        issues.append("actual offline anonymous HTTP probe must execute in CI")
    if "npm run build:web" not in text:
        issues.append("public web bundle must be built for publication audit")
    if "python3 tools/release_publication_gate.py" not in text:
        issues.append("compiled publication privacy audit must execute in CI")
    if "python3 tools/verify_browser_release_surface.py" not in text:
        issues.append("browser cache and loopback preview audit must execute in CI")
    return issues


class WorkflowBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.policy = WORKFLOW.read_text(encoding="utf-8")

    def test_current_workflow_is_fail_closed(self) -> None:
        self.assertEqual(audit_ci_boundary(self.policy), [])
        self.assertIn("/tools/verify_release_boundary.py",
                      sparse_checkout_lists(self.policy)[0])
        root = WORKFLOW.parents[2]
        includes = json.loads((root / 'tsconfig.json').read_text(encoding='utf-8'))['include']
        vitest = (root / 'vitest.config.ts').read_text(encoding='utf-8')
        for suffix in ('ts', 'tsx'):
            self.assertIn(f'packages/ui/src/**/*.{suffix}', includes)
            self.assertIn(f'packages/ui/src/**/*.test.{suffix}', vitest)
        for name in ("release_entrypoint_gate.test.mjs", "release_session_csrf.test.mjs"):
            self.assertTrue(
                (WORKFLOW.parents[2] / "tests/security" / name).is_file(),
                "owned security test file missing from sparse CI checkout",
            )

    def test_main_only_stacked_pr_regression_is_rejected(self) -> None:
        changed = self.policy.replace(
            "  pull_request:\n", "  pull_request:\n    branches: [main]\n", 1
        )
        self.assertTrue(audit_ci_boundary(changed))

    def test_reviewed_ai_worker_helpers_are_in_synthetic_ci(self):
        self.assertIn('/infra/ai/', sparse_checkout_lists(self.policy)[0])

    def test_offline_provider_source_is_present_in_both_backend_checkouts(self) -> None:
        for paths in sparse_checkout_lists(self.policy):
            self.assertIn('/packages/ai/src/', paths)

    def test_path_filtered_pr_regression_is_rejected(self) -> None:
        changed = self.policy.replace(
            "  pull_request:\n", "  pull_request:\n    paths: [apps/api/**]\n", 1
        )
        self.assertTrue(audit_ci_boundary(changed))

    def test_mutable_actions_or_unreviewed_action_are_rejected(self) -> None:
        for changed in (
            self.policy.replace(PINNED_CHECKOUT, "actions/checkout@v4", 1),
            self.policy.replace(PINNED_SETUP_NODE, "actions/setup-node@main", 1),
            self.policy.replace(PINNED_CHECKOUT, "actions/checkout@0000000000000000000000000000000000000000", 1),
            self.policy + "\n  - uses: untrusted/third-party@v1\n",
        ):
            with self.subTest(changed=changed != self.policy):
                self.assertTrue(audit_ci_boundary(changed))

    def test_missing_branch_cleanup_safety_test_is_rejected(self) -> None:
        changed = self.policy.replace(
            "node --test tools/tests/prune-merged-branches.node.mjs", "echo skipped", 1
        )
        self.assertTrue(audit_ci_boundary(changed))

    def test_missing_browser_cache_gate_is_rejected(self) -> None:
        changed = self.policy.replace(
            "python3 tools/verify_browser_release_surface.py",
            "echo skipped", 1,
        )
        self.assertTrue(audit_ci_boundary(changed))

    def test_missing_publication_audit_is_rejected(self) -> None:
        changed = self.policy.replace("python3 tools/release_publication_gate.py", "echo skipped", 1)
        self.assertTrue(audit_ci_boundary(changed))

    def test_missing_anonymous_http_probe_is_rejected(self) -> None:
        changed = self.policy.replace("node tools/release_entrypoint_gate.mjs", "echo skipped", 1)
        self.assertTrue(audit_ci_boundary(changed))

    def test_raw_student_directory_in_checkout_is_rejected(self) -> None:
        changed = self.policy.replace(
            "            /tests/security/\n",
            "            /tests/security/\n            /csv/\n", 1
        )
        self.assertTrue(audit_ci_boundary(changed))

    def test_credentials_permissions_and_missing_guard_are_rejected(self) -> None:
        for changed in (
            self.policy.replace("persist-credentials: false", "persist-credentials: true", 1),
            self.policy.replace("permissions:\n  contents: read", "permissions:\n  contents: write", 1),
            self.policy.replace("test ! -d csv\n", "", 1),
            self.policy.replace("  postgres-integration:", "  disabled-postgres:"),
            self.policy.replace("  pull_request:", "  pull_request_target:", 1),
        ):
            with self.subTest(change=changed != self.policy):
                self.assertTrue(audit_ci_boundary(changed))


if __name__ == "__main__":
    unittest.main()
