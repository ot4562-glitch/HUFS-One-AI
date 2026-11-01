"""Fail-closed checks for the PR workflow configuration; synthetic files only.

This is a targeted configuration contract, not a general YAML parser or a release
approval. It deliberately rejects new checkout paths until explicitly reviewed.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path


WORKFLOW = Path(__file__).resolve().parents[2] / ".github/workflows/task00-contracts.yml"
SAFE_SPARSE_PATHS = frozenset({
    "/package.json", "/package-lock.json", "/tsconfig.json", "/vitest.config.ts",
    "/packages/contracts/", "/packages/fixtures/synthetic/",
    "/packages/fixtures/negative/", "/packages/core/", "/apps/api/",
    "/apps/web/", "/infra/sql/", "/tests/contracts/", "/tests/consumers/",
    "/tests/api/", "/tests/integration/", "/tests/e2e/", "/tests/evaluation/",
    "/tests/security/", "/tests/release/",
    "/.github/workflows/task00-contracts.yml",
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

    checkouts = text.count("uses: actions/checkout@v4")
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
            "/.github/workflows/task00-contracts.yml",
        }.issubset(sparse[0]):
            issues.append("synthetic job omits release policy tests or workflow")
        if "/infra/sql/" not in sparse[1] or "/tests/api/" not in sparse[1]:
            issues.append("disposable PostgreSQL checkout lacks tests/migrations")

    for directory in EXCLUDED_DIRECTORIES:
        if text.count(f"test ! -d {directory}") != 2:
            issues.append(f"both jobs must assert absence of {directory}")
    if "python3 -m unittest discover -s tests/release" not in text:
        issues.append("release policy regression tests must execute in CI")
    return issues


class WorkflowBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.policy = WORKFLOW.read_text(encoding="utf-8")

    def test_current_workflow_is_fail_closed(self) -> None:
        self.assertEqual(audit_ci_boundary(self.policy), [])

    def test_main_only_stacked_pr_regression_is_rejected(self) -> None:
        changed = self.policy.replace(
            "  pull_request:\n", "  pull_request:\n    branches: [main]\n", 1
        )
        self.assertTrue(audit_ci_boundary(changed))

    def test_path_filtered_pr_regression_is_rejected(self) -> None:
        changed = self.policy.replace(
            "  pull_request:\n", "  pull_request:\n    paths: [apps/api/**]\n", 1
        )
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
