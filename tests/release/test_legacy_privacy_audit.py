"""Issue #46: never open or report sensitive Git index paths (synthetic only).

Tests invoke the legacy local publication script inside a throwaway Git repo.
No actual student file, Gmail/Forms data or credentials are used.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ORIGINAL = Path(__file__).resolve().parents[2] / "tools/verify_release_boundary.py"
ACTIVE_DOCS = (
    "Proposal.md", "Architecture.md", "README.md", "AGENTS.md", "PROJECT.md",
    "REPORT.md", "CLOUD.md", "TEAM_SURVEY.md", "APPLICATION.md", "STATUS.md",
    "reference/hufsability/DATA_PERMISSION_GATE.md",
)
SENTINEL_PATH = "csv/synthetic-owner-private.json"


class LegacyAuditPrivacyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory(prefix="synthetic-git-privacy-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        source = ORIGINAL.read_text(encoding="utf-8")
        # This synthetic fixture tests generic forbidden paths separately from
        # the five immutable user-restored Git blobs pinned in the real repo.
        first = source.index('APPROVED_CSV_BLOBS={')
        last = source.index('\nchecks=[]', first)
        source = source[:first] + 'APPROVED_CSV_BLOBS={}\n' + source[last + 1:]
        self.write("tools/verify_release_boundary.py", source)
        for path in ACTIVE_DOCS:
            self.write(path, "synthetic document only\n")
        self.write(".dockerignore", "\n".join([
            "local_only", "reference/hufsability", "HUFS_UI.pdf", "retire",
            "secrets", "data/real5", "packages/fixtures/real5",
        ]) + "\n")
        self.write(SENTINEL_PATH, '{"synthetic_only":true}')
        self.write("private/synthetic-identity-map.json", '{"synthetic_only":true}')
        # Fail loudly if the publication script attempts to read protected
        # file *contents*. Git may inspect synthetic index names/metadata.
        self.write("sitecustomize.py", """
from pathlib import Path
_original_read = Path.read_text
def safe_read(self, *args, **kwargs):
    target = self.as_posix()
    if '/csv/' in target or '/private/' in target:
        raise RuntimeError('PROTECTED_BYTES_WERE_READ')
    return _original_read(self, *args, **kwargs)
Path.read_text = safe_read
""")
        subprocess.run(["git", "-C", str(self.root), "init", "-q"],
                       check=True, capture_output=True)
        subprocess.run(["git", "-C", str(self.root), "add", "-f",
                        SENTINEL_PATH, "private/synthetic-identity-map.json"],
                       check=True, capture_output=True)

    def write(self, relative: str, value: str) -> None:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")

    def invoke(self) -> tuple[subprocess.CompletedProcess[str], dict]:
        env = dict(os.environ, PYTHONPATH=str(self.root))
        run = subprocess.run(
            [sys.executable, str(self.root / "tools/verify_release_boundary.py")],
            cwd=self.root, env=env, capture_output=True, text=True,
            timeout=20, check=False,
        )
        report_path = self.root / "local_only/reports/publication_boundary.json"
        self.assertTrue(report_path.is_file(), run.stderr[-500:])
        return run, json.loads(report_path.read_text(encoding="utf-8"))

    def test_protected_index_paths_are_counted_but_never_opened(self) -> None:
        run, report = self.invoke()
        self.assertEqual(run.returncode, 1)
        self.assertNotIn("PROTECTED_BYTES_WERE_READ", run.stderr)
        self.assertGreaterEqual(report["protected_tracked_count"], 2)
        self.assertGreaterEqual(report["protected_candidate_count"], 2)
        self.assertIn("no_protected_tracked_files",
                      [failure["name"] for failure in report["failures"]])
        self.assertEqual(report["result"], "FAIL")

    def test_reports_omit_sensitive_names_and_candidate_file_lists(self) -> None:
        run, report = self.invoke()
        output = run.stdout + run.stderr + json.dumps(report, ensure_ascii=False)
        self.assertNotIn(SENTINEL_PATH, output)
        self.assertNotIn("synthetic-identity-map.json", output)
        self.assertNotIn('"candidate_files"', output)
        self.assertNotIn("PROTECTED_BYTES_WERE_READ", output)

    def test_committed_tree_gate_catches_sparse_hidden_private_paths_without_opening_bytes(self) -> None:
        def run_git(*args: str) -> None:
            subprocess.run(['git', '-C', str(self.root), *args],
                           check=True, capture_output=True)
        run_git('config', 'user.name', 'Synthetic Reviewer')
        run_git('config', 'user.email', 'synthetic@example.invalid')
        run_git('commit', '-qm', 'synthetic protected index')
        env = dict(os.environ, PYTHONPATH=str(self.root))
        def scan() -> tuple[subprocess.CompletedProcess[str], dict]:
            result = subprocess.run([sys.executable, str(self.root / 'tools/verify_release_boundary.py'),
                                     '--committed-tree-only'], cwd=self.root, env=env,
                                    capture_output=True, text=True, check=False, timeout=20)
            return result, json.loads(result.stdout)
        denied, blocked = scan()
        self.assertEqual(denied.returncode, 1)
        self.assertEqual(blocked['protected_count'], 2)
        self.assertEqual(blocked['scope'], 'GIT_TREE_METADATA_ONLY')
        self.assertNotIn(SENTINEL_PATH, denied.stdout + denied.stderr)
        self.assertNotIn('synthetic-identity-map', denied.stdout + denied.stderr)
        self.assertNotIn('PROTECTED_BYTES_WERE_READ', denied.stdout + denied.stderr)
        run_git('rm', '--cached', '-q', '--', SENTINEL_PATH, 'private/synthetic-identity-map.json')
        run_git('commit', '-qm', 'synthetic protected untrack')
        accepted, clean = scan()
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        self.assertEqual(clean['protected_count'], 0)

    def test_allowlisted_synthetic_blob_is_immutable_in_git_tree(self) -> None:
        """Exercise approved hashes with a throwaway fabricated CSV, never real bytes."""
        def run_git(*args: str) -> str:
            return subprocess.run(['git', '-C', str(self.root), *args],
                                  check=True, capture_output=True, text=True).stdout.strip()
        run_git('config', 'user.name', 'Synthetic Reviewer')
        run_git('config', 'user.email', 'synthetic@example.invalid')
        run_git('rm', '--cached', '-q', '--', SENTINEL_PATH, 'private/synthetic-identity-map.json')
        self.write('csv/synthetic-allowed.csv', 'fake,header\nfictional,record\n')
        blob = run_git('hash-object', '--', 'csv/synthetic-allowed.csv')
        script = self.root / 'tools/verify_release_boundary.py'
        fixture = script.read_text(encoding='utf-8')
        self.assertIn('APPROVED_CSV_BLOBS={}', fixture)
        script.write_text(fixture.replace('APPROVED_CSV_BLOBS={}',
                         "APPROVED_CSV_BLOBS={'csv/synthetic-allowed.csv':'" + blob + "'}"),
                         encoding='utf-8')
        run_git('add', '-f', '--', 'csv/synthetic-allowed.csv')
        run_git('commit', '-qm', 'synthetic pinned CSV')
        def scan() -> tuple[subprocess.CompletedProcess[str], dict]:
            env = dict(os.environ, PYTHONPATH=str(self.root))
            result = subprocess.run([sys.executable, str(script), '--committed-tree-only'],
                                    cwd=self.root, env=env, capture_output=True,
                                    text=True, check=False, timeout=20)
            return result, json.loads(result.stdout)
        okay, reported = scan()
        self.assertEqual(okay.returncode, 0, okay.stderr)
        self.assertEqual(reported['preserved_csv_count'], 1)
        self.assertFalse(reported['csv_contents_read'])
        self.write('csv/synthetic-allowed.csv', 'fake,header\nfictional,changed\n')
        run_git('add', '-f', '--', 'csv/synthetic-allowed.csv')
        run_git('commit', '-qm', 'synthetic unauthorized edit')
        denied, broken = scan()
        self.assertEqual(denied.returncode, 1)
        self.assertEqual(broken['preserved_csv_mismatch_count'], 1)
        self.assertNotIn('fictional', denied.stdout + denied.stderr)

    def test_publication_secret_signature_finding_is_hash_only(self) -> None:
        synthetic_not_real_key = "ghp_" + "A" * 40
        self.write("safe/synthetic-published.json",
                   '{"synthetic_marker":"' + synthetic_not_real_key + '"}')
        run, report = self.invoke()
        findings = next(item["detail"] for item in report["results"]
                        if item["name"] == "no_common_secret_signatures_in_candidates")
        self.assertTrue(findings)
        self.assertTrue(all("path_hash" in item and "file" not in item
                            for item in findings))
        output = run.stdout + json.dumps(report)
        self.assertNotIn(synthetic_not_real_key, output)
        self.assertNotIn("safe/synthetic-published.json", output)

    def test_document_link_failure_redacts_private_target(self) -> None:
        name = "synthetic-owner-secret-document.json"
        self.write("README.md", f"Synthetic link [private]({name})\n")
        run, report = self.invoke()
        output = run.stdout + run.stderr + json.dumps(report)
        self.assertNotIn(name, output)
        self.assertTrue(any(item["name"].startswith("link:README.md:")
                            for item in report["results"]))


if __name__ == "__main__":
    unittest.main()
