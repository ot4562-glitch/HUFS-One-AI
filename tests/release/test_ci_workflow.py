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
PROVIDER_HTTP_PG_PROOF = (
    "CREATE DATABASE hufs_one_provider_integration_test",
    "HUFS_PG_PROVIDER_INTEGRATION_LIVE: '1'",
    "HUFS_PG_PROVIDER_INTEGRATION_URL: postgres://hufs_local_admin:synthetic-ci-only@127.0.0.1:5432/hufs_one_provider_integration_test",
    "tests/api/pg-provider-integration-live-opt-in.test.ts",
    "Build compiled API for the separate-process Provider HTTP proof",
)

REVISION_CLAIMS_PG_PROOF = (
    "  revision-claims-real-postgres:",
    "--network host",
    "-c listen_addresses=127.0.0.1 -c port=15439",
    "createdb -h 127.0.0.1 -p 15439 -U hufs_local_admin hufs_one_revision_claims_test",
    "HUFS_PG_REVISION_CLAIMS_LIVE: '1'",
    "HUFS_PG_REVISION_CLAIMS_URL: postgres://hufs_local_admin:synthetic-ci-only@127.0.0.1:15439/hufs_one_revision_claims_test",
    "tests/api/pg-revision-claims-live-opt-in.test.ts",
)
DEMO_PROFILE_PG_PROOF = (
    "createdb -h 127.0.0.1 -p 15439 -U hufs_local_admin hufs_one_demo_profile_test",
    "HUFS_PG_DEMO_PROFILE_LIVE: '1'",
    "HUFS_PG_DEMO_PROFILE_URL: postgres://hufs_local_admin:synthetic-ci-only@127.0.0.1:15439/hufs_one_demo_profile_test",
    "tests/api/demo-profile-live-opt-in.test.ts",
)
OWNER_ACADEMICS_PG_PROOF = (
    "- 15439:5432",
    "CREATE DATABASE hufs_one_owner_academics_test",
    "HUFS_PG_OWNER_ACADEMICS_LIVE: '1'",
    "HUFS_PG_OWNER_ACADEMICS_URL: postgres://hufs_local_admin:synthetic-ci-only@127.0.0.1:15439/hufs_one_owner_academics_test",
    "tests/api/pg-owner-academics-live-opt-in.test.ts",
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
    if (len(actions) != 6 or actions.count(PINNED_CHECKOUT) != 3
        or actions.count(PINNED_SETUP_NODE) != 3):
        issues.append("only reviewed commit-pinned checkout and setup-node are permitted")
    checkouts = text.count("uses: " + PINNED_CHECKOUT)
    if checkouts != 3 or text.count("persist-credentials: false") != checkouts:
        issues.append("each checkout must disable credential persistence")
    if checkouts != 3 or text.count("sparse-checkout-cone-mode: false") != checkouts:
        issues.append("each checkout must retain explicit sparse rules")
    sparse = sparse_checkout_lists(text)
    if len(sparse) != 3:
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
        if any("/infra/sql/" not in paths or "/tests/api/" not in paths for paths in sparse[1:]):
            issues.append("disposable PostgreSQL checkout lacks tests/migrations")
        if any("/apps/web/" not in paths for paths in sparse[1:]):
            issues.append("both real PostgreSQL jobs must checkout the reviewed browser client")

    for directory in EXCLUDED_DIRECTORIES:
        if text.count(f"test ! -d {directory}") != 3:
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
    if any(proof not in text for proof in OWNER_ACADEMICS_PG_PROOF):
        issues.append("owner-academics SQL proof must execute in its isolated opt-in database")
    if any(proof not in text for proof in PROVIDER_HTTP_PG_PROOF):
        issues.append("Provider HTTP/process-restart proof must execute in its isolated opt-in database")
    if any(proof not in text for proof in REVISION_CLAIMS_PG_PROOF):
        issues.append("revision-claims SQL proof must execute on a distinct loopback PostgreSQL 18 server")
    if any(proof not in text for proof in DEMO_PROFILE_PG_PROOF):
        issues.append("EMPTY_DEMO SQL proof must execute against the isolated real PostgreSQL 18 server")
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

    def test_owner_academics_sql_proof_cannot_silently_skip(self) -> None:
        for proof in OWNER_ACADEMICS_PG_PROOF:
            with self.subTest(proof=proof):
                self.assertTrue(proof in self.policy, "Missing owner-academics SQL CI prerequisite")
                self.assertTrue(audit_ci_boundary(self.policy.replace(proof, "", 1)))

    def test_provider_http_pg_proof_cannot_silently_skip(self) -> None:
        for proof in PROVIDER_HTTP_PG_PROOF:
            with self.subTest(proof=proof):
                self.assertIn(proof, self.policy)
                self.assertTrue(audit_ci_boundary(self.policy.replace(proof, "", 1)))

    def test_revision_claims_sql_proof_cannot_silently_skip(self) -> None:
        for proof in REVISION_CLAIMS_PG_PROOF:
            with self.subTest(proof=proof):
                self.assertIn(proof, self.policy)
                self.assertTrue(audit_ci_boundary(self.policy.replace(proof, "", 1)))

    def test_empty_demo_sql_proof_cannot_silently_skip(self) -> None:
        for proof in DEMO_PROFILE_PG_PROOF:
            with self.subTest(proof=proof):
                self.assertIn(proof, self.policy)
                self.assertTrue(audit_ci_boundary(self.policy.replace(proof, "", 1)))

    def test_real_empty_demo_browser_source_cannot_be_excluded(self) -> None:
        self.assertIn("/apps/web/", sparse_checkout_lists(self.policy)[-1])
        before, job = self.policy.split("  revision-claims-real-postgres:", 1)
        changed = before + "  revision-claims-real-postgres:" + job.replace(
            "            /apps/web/\n", "", 1
        )
        self.assertTrue(audit_ci_boundary(changed))

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
