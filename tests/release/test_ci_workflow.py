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
# Explicitly reviewed action/checkout v7.0.1 full Git tag commit (Node 24 runtime).
# Require full commit identity, not a mutable tag, branch or unreviewed action.
PINNED_CHECKOUT = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"
PINNED_SETUP_NODE = "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020"
SAFE_SPARSE_PATHS = frozenset({
    "/tools/evaluation/", "/docs/INDEPENDENT_EVALUATION.md",
    "/tests/fixtures/academic-133.ts",
    "/package.json", "/package-lock.json", "/tsconfig.json", "/vitest.config.ts",
    "/packages/contracts/", "/packages/ai/src/", "/packages/fixtures/synthetic/",
    "/packages/fixtures/negative/", "/packages/core/", "/apps/api/",
    "/packages/ui/", "/tools/audit_private_git_metadata.py",
    "/tools/private_registry_io.mjs",
    "/tools/strip_build_sourcemaps.mjs",
    "/tools/check_postgres_migration_plan.mjs",
    "/tools/prune_merged_branches.mjs",
    "/tools/tests/prune-merged-branches.node.mjs",
    "/tools/audit_entrypoints.mjs", "/tools/entrypoints.json",
    "/tools/tests/entrypoint-inventory.node.mjs",
    "/tools/audit_dependency_licenses.mjs", "/tools/dependency_bom.mjs",
    "/tools/audit_api_contracts.mjs", "/tools/api_contract_inventory.json",
    "/tools/tests/api-contract-inventory.node.mjs",
    "/apps/web/", "/infra/sql/", "/infra/laya/", "/infra/deploy/", "/infra/ai/", "/infra/ncp/", "/infra/postgres/", "/tests/contracts/", "/tests/consumers/",
    "/tests/api/", "/tests/integration/", "/tests/e2e/", "/tests/evaluation/",
    "/tests/security/", "/tests/release/", "/tools/release_entrypoint_gate.mjs",
    "/tools/release_publication_gate.py", "/.dockerignore",
    "/tools/release_readiness_gate.py",
    "/tools/verify_browser_release_surface.py",
    "/tools/verify_release_boundary.py",
    "/.github/workflows/release-readiness.yml",
    "/.github/workflows/task00-contracts.yml",
    "/.github/workflows/ui-browser-e2e.yml",
    "/.github/workflows/independent-pr-review.yml",
})
EXCLUDED_DIRECTORIES = (
    "csv", "local_only", "templates/real5-intake", "reference/hufsability/raw",
)
PROVIDER_HTTP_PG_PROOF = (
    "CREATE DATABASE hufs_one_provider_integration_test",
    "HUFS_PG_PROVIDER_INTEGRATION_LIVE: '1'",
    "HUFS_PG_PROVIDER_INTEGRATION_URL: postgres://hufs_local_admin:synthetic-ci-only@127.0.0.1:5432/hufs_one_provider_integration_test",
    "tests/api/pg-provider-integration-live-opt-in.test.ts",
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
SYNTHETIC_CLUB_PG_PROOF = (
    "createdb -h 127.0.0.1 -p 15439 -U hufs_local_admin hufs_one_synthetic_club_test",
    "HUFS_PG_SYNTHETIC_CLUB_LIVE: '1'",
    "HUFS_PG_SYNTHETIC_CLUB_URL: postgres://hufs_local_admin:synthetic-ci-only@127.0.0.1:15439/hufs_one_synthetic_club_test",
    "tests/api/synthetic-club-live-opt-in.test.ts",
)
DEMO_PROFILE_PG_PROOF = (
    "createdb -h 127.0.0.1 -p 15439 -U hufs_local_admin hufs_one_demo_profile_test",
    "HUFS_PG_DEMO_PROFILE_LIVE: '1'",
    "HUFS_PG_DEMO_PROFILE_URL: postgres://hufs_local_admin:synthetic-ci-only@127.0.0.1:15439/hufs_one_demo_profile_test",
    "tests/api/demo-profile-live-opt-in.test.ts",
)
RECOVERY_PG_PROOF = (
    'run: npm run build:api',
    '--network none --cpus=2 --memory=1g --pids-limit=100',
    '-e HUFS_RECOVERY_CONTAINER=synthetic-ci-only',
    'source=$PWD/dist,target=/work/dist,readonly',
    'source=$PWD/node_modules,target=/work/node_modules,readonly',
    'source=$node_binary,target=/opt/hufs-node,readonly',
    'source=$PWD/tests/api/fixtures/postgres-recovery-live.mjs,target=/work/tests/api/fixtures/postgres-recovery-live.mjs,readonly',
    '--entrypoint bash postgres:18 /work/infra/postgres/synthetic-recovery-drill.sh',
)
OWNER_ACADEMICS_PG_PROOF = (
    "- 15439:5432",
    "CREATE DATABASE hufs_one_owner_academics_test",
    "HUFS_PG_OWNER_ACADEMICS_LIVE: '1'",
    "HUFS_PG_OWNER_ACADEMICS_URL: postgres://hufs_local_admin:synthetic-ci-only@127.0.0.1:15439/hufs_one_owner_academics_test",
    "tests/api/pg-owner-academics-live-opt-in.test.ts",
)
MIGRATIONS_PG_PROOF = (
    "CREATE DATABASE hufs_one_migration_test",
    "HUFS_PG_MIGRATIONS_LIVE: '1'",
    "HUFS_PG_MIGRATIONS_URL: postgres://hufs_local_admin:synthetic-ci-only@127.0.0.1:5432/hufs_one_migration_test",
    "tests/api/pg-migrations-live-opt-in.test.ts",
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


def has_compiled_api_before_live_consumers(text: str) -> bool:
    marker = "  postgres-integration:\n"
    if marker not in text:
        return False
    job = re.split(r"(?m)^  [A-Za-z0-9_-]+:\s*$", text.split(marker, 1)[1], maxsplit=1)[0]
    builds = list(re.finditer(r"(?m)^        run: npm run build:api\s*$", job))
    if len(builds) != 1:
        return False
    if any(command.start() < builds[0].end() for command in
           re.finditer(r"(?m)^          docker run --rm --network none\b", job)):
        return False
    commands = list(re.finditer(r"(?m)^        run: npx vitest run ([^\n]+)$", job))
    required = ("tests/api/pg-owner-academics-live-opt-in.test.ts",
                "tests/api/pg-provider-integration-live-opt-in.test.ts")
    return all(any(command.start() > builds[0].end() and path in command.group(1).split()
                   for command in commands) for path in required)


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
        if any("/tests/fixtures/academic-133.ts" not in paths for paths in sparse):
            issues.append("academic scope regression fixture must be present in every test job")
        for index, paths in enumerate(sparse):
            if not paths or len(paths) != len(set(paths)):
                issues.append(f"checkout {index} has empty/duplicate entries")
            if not set(paths).issubset(SAFE_SPARSE_PATHS):
                issues.append(f"checkout {index} exceeds reviewed synthetic paths")
        if not {
            "/tests/release/", "/tests/security/",
            "/infra/postgres/",
            "/packages/ui/", "/tools/audit_private_git_metadata.py",
            "/tools/private_registry_io.mjs",
            "/tools/strip_build_sourcemaps.mjs",
            "/tools/prune_merged_branches.mjs",
            "/tools/tests/prune-merged-branches.node.mjs",
            "/tools/audit_dependency_licenses.mjs", "/tools/dependency_bom.mjs",
            "/tools/audit_api_contracts.mjs", "/tools/api_contract_inventory.json",
            "/tools/tests/api-contract-inventory.node.mjs",
            "/.github/workflows/task00-contracts.yml",
            "/.github/workflows/ui-browser-e2e.yml",
            "/tools/release_entrypoint_gate.mjs",
            "/tools/release_publication_gate.py",
            "/.dockerignore",
            "/tools/release_readiness_gate.py",
            "/tools/verify_browser_release_surface.py",
            "/tools/verify_release_boundary.py",
            "/.github/workflows/release-readiness.yml",
            "/.github/workflows/independent-pr-review.yml",
        }.issubset(sparse[0]):
            issues.append("synthetic job omits release policy tests or workflow")
        if any("/infra/sql/" not in paths or "/tests/api/" not in paths for paths in sparse[1:]):
            issues.append("disposable PostgreSQL checkout lacks tests/migrations")
        if any("/apps/web/" not in paths for paths in sparse[1:]):
            issues.append("both real PostgreSQL jobs must checkout the reviewed browser client")
        if "/infra/postgres/" not in sparse[1]:
            issues.append("native recovery job must checkout its synthetic container harness")

    for directory in EXCLUDED_DIRECTORIES:
        if text.count(f"test ! -d {directory}") != 3:
            issues.append(f"both jobs must assert absence of {directory}")
    if "python3 -m unittest discover -s tests/release" not in text:
        issues.append("release policy regression tests must execute in CI")
    if "node --test tests/security/*.test.mjs" not in text:
        issues.append("security negative regression tests must execute in CI")
    if "node --test tools/tests/prune-merged-branches.node.mjs" not in text:
        issues.append("branch cleanup fail-closed tests must execute in CI")
    for command in ("npm run test:dependency-evidence", "npm run test:api-contracts"):
        if command not in text:
            issues.append("offline evidence regression tests must execute in CI")
    if not sparse or not {"/tools/evaluation/", "/docs/INDEPENDENT_EVALUATION.md"}.issubset(sparse[0]):
        issues.append("independent evaluation CLI source and export instructions must be checked out")
    for command in ("npm run build:evaluation", "npm run test:evaluation:cli", "npm run eval:review -- fixtures --action check"):
        if command not in text:
            issues.append("independent evaluation compile, CLI and fixture checks must execute")
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
    if any(proof not in text for proof in MIGRATIONS_PG_PROOF):
        issues.append("reviewed migration proof must execute against a fresh isolated database")

    if any(proof not in text for proof in PROVIDER_HTTP_PG_PROOF):
        issues.append("Provider HTTP/process-restart proof must execute in its isolated opt-in database")
    if not has_compiled_api_before_live_consumers(text):
        issues.append("the PostgreSQL job must compile API before both live compiled consumers")
    if any(proof not in text for proof in REVISION_CLAIMS_PG_PROOF):
        issues.append("revision-claims SQL proof must execute on a distinct loopback PostgreSQL 18 server")
    if any(proof not in text for proof in SYNTHETIC_CLUB_PG_PROOF):
        issues.append("club publication SQL proof must execute against its isolated real PostgreSQL 18 database")
    if any(proof not in text for proof in DEMO_PROFILE_PG_PROOF):
        issues.append("EMPTY_DEMO SQL proof must execute against the isolated real PostgreSQL 18 server")
    if any(proof not in text for proof in RECOVERY_PG_PROOF):
        issues.append("native recovery proof must execute in a bounded isolated PostgreSQL 18 container")
    if not has_compiled_api_before_live_consumers(text):
        issues.append("the PostgreSQL job must compile API before both live compiled consumers")
    return issues


class WorkflowBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.policy = WORKFLOW.read_text(encoding="utf-8")

    def test_current_workflow_is_fail_closed(self) -> None:
        self.assertEqual(audit_ci_boundary(self.policy), [])

    def test_compiled_pg_build_uses_command_and_order_not_step_label(self) -> None:
        renamed = self.policy.replace(
            'Build compiled API for live adapters and process restart proofs', 'Compile backend once for live tests'
        )
        self.assertEqual(audit_ci_boundary(renamed), [])

    def test_pg_build_cannot_be_removed_or_replaced_by_another_jobs_build(self) -> None:
        before, job = self.policy.split('  postgres-integration:\n', 1)
        changed = before + '  postgres-integration:\n' + job.replace(
            '        run: npm run build:api', '        run: echo build-not-executed', 1)
        self.assertTrue(audit_ci_boundary(changed))

    def test_pg_build_must_precede_both_live_compiled_consumers(self) -> None:
        before, job = self.policy.split('  postgres-integration:\n', 1)
        changed = job.replace('        run: npm run build:api', '        run: echo not-built-yet', 1)
        changed = changed.replace('  revision-claims-real-postgres:',
            '      - name: too late\n        run: npm run build:api\n\n  revision-claims-real-postgres:', 1)
        self.assertTrue(audit_ci_boundary(before + '  postgres-integration:\n' + changed))
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

    def test_native_recovery_proof_cannot_silently_skip(self) -> None:
        for proof in RECOVERY_PG_PROOF:
            self.assertTrue(audit_ci_boundary(self.policy.replace(proof, '')), proof)
        root = WORKFLOW.parents[2]
        harness = (root / 'infra/postgres/synthetic-recovery-drill.sh').read_text(encoding='utf-8')
        for required in ('set -euo pipefail', '--auth-host=scram-sha-256',
                         'HUFS_RECOVERY_LIVE=1', 'pg_ctl stop', '--synthetic',
                         'HUFS_RECOVERY_CONTAINER', '-f /.dockerenv'):
            self.assertIn(required, harness)
        self.assertNotIn('rm -rf', harness)

    def test_compiled_pg_build_uses_command_and_order_not_step_label(self) -> None:
        renamed = self.policy.replace(
            'Build compiled API for live adapters and process restart proofs', 'Compile backend once for live tests'
        )
        self.assertEqual(audit_ci_boundary(renamed), [])

    def test_pg_build_cannot_be_removed_or_replaced_by_another_jobs_build(self) -> None:
        before, job = self.policy.split('  postgres-integration:\n', 1)
        changed = before + '  postgres-integration:\n' + job.replace(
            '        run: npm run build:api', '        run: echo build-not-executed', 1)
        self.assertTrue(audit_ci_boundary(changed))

    def test_pg_build_must_precede_both_live_compiled_consumers(self) -> None:
        before, job = self.policy.split('  postgres-integration:\n', 1)
        changed = job.replace('        run: npm run build:api', '        run: echo not-built-yet', 1)
        changed = changed.replace('  revision-claims-real-postgres:',
            '      - name: too late\n        run: npm run build:api\n\n  revision-claims-real-postgres:', 1)
        self.assertTrue(audit_ci_boundary(before + '  postgres-integration:\n' + changed))

    def test_main_only_stacked_pr_regression_is_rejected(self) -> None:
        changed = self.policy.replace(
            "  pull_request:\n", "  pull_request:\n    branches: [main]\n", 1
        )
        self.assertTrue(audit_ci_boundary(changed))

    def test_reviewed_laya_worker_helpers_are_in_synthetic_ci(self):
        self.assertIn('/infra/laya/', sparse_checkout_lists(self.policy)[0])

    def test_isolated_recovery_container_requires_compiled_api_first(self) -> None:
        build = ('      - name: Build compiled API for live adapters and process restart proofs\n'
                 '        run: npm run build:api\n')
        changed = self.policy.replace(build, '', 1).replace(
            '      - name: Real PostgreSQL migrations, roles, CAS, revocation, limits and Temporal SQL',
            build + '      - name: Real PostgreSQL migrations, roles, CAS, revocation, limits and Temporal SQL', 1)
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

    def test_reviewed_migration_proof_cannot_silently_skip(self) -> None:
        for proof in MIGRATIONS_PG_PROOF:
            with self.subTest(proof=proof):
                self.assertTrue(proof in self.policy, "Missing reviewed migration CI prerequisite")
                self.assertTrue(audit_ci_boundary(self.policy.replace(proof, "", 1)))
        self.assertIn('/tools/check_postgres_migration_plan.mjs', sparse_checkout_lists(self.policy)[1])

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

    def test_synthetic_club_sql_proof_cannot_silently_skip(self) -> None:
        for proof in SYNTHETIC_CLUB_PG_PROOF:
            with self.subTest(proof=proof):
                self.assertIn(proof, self.policy)
                self.assertTrue(audit_ci_boundary(self.policy.replace(proof, "", 1)))

    def test_evaluation_commands_and_sources_cannot_be_omitted(self) -> None:
        for token in ("npm run build:evaluation", "npm run test:evaluation:cli", "npm run eval:review -- fixtures --action check", "            /tools/evaluation/\n", "            /docs/INDEPENDENT_EVALUATION.md\n"):
            with self.subTest(token=token):
                self.assertIn(token, self.policy)
                self.assertTrue(audit_ci_boundary(self.policy.replace(token, "", 1)))

    def test_academic_scope_fixture_is_in_every_test_checkout(self) -> None:
        fixture_path = "            /tests/fixtures/academic-133.ts\n"
        self.assertEqual(self.policy.count(fixture_path), 3)
        for job_index in range(3):
            chunks = self.policy.split(fixture_path)
            changed = fixture_path.join(chunks[:job_index + 1]) + fixture_path.join(chunks[job_index + 1:])
            self.assertTrue(audit_ci_boundary(changed))

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

    def test_offline_evidence_checks_cannot_be_omitted(self) -> None:
        for command in ("npm run test:dependency-evidence", "npm run test:api-contracts"):
            with self.subTest(command=command):
                self.assertIn(command, self.policy)
                self.assertTrue(audit_ci_boundary(self.policy.replace(command, "echo skipped", 1)))
        for path in ("/tools/audit_dependency_licenses.mjs", "/tools/dependency_bom.mjs",
                     "/tools/audit_api_contracts.mjs", "/tools/api_contract_inventory.json",
                     "/tools/tests/api-contract-inventory.node.mjs"):
            with self.subTest(path=path):
                self.assertIn(path, sparse_checkout_lists(self.policy)[0])
                changed = self.policy.replace("            " + path + "\n", "", 1)
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
