import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('audit_private_git_metadata', ROOT / 'tools/audit_private_git_metadata.py')


class PrivateGitMetadataTests(unittest.TestCase):
    def test_history_receipts_do_not_open_or_publish_originals_or_names(self):
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            def git(*args):
                return subprocess.check_output(['git', '-C', directory, *args], stderr=subprocess.DEVNULL).decode().strip()
            git('init')
            git('config', 'user.name', 'Synthetic operator')
            git('config', 'user.email', 'synthetic@example.invalid')
            private = repo / 'csv' / 'NEVER_PUBLISH_NAME.csv'
            private.parent.mkdir()
            private.write_text('NEVER_PUBLISH_CONTENT', encoding='utf-8')
            git('add', '.')
            git('commit', '-m', 'synthetic metadata fixture')
            first = git('rev-parse', 'HEAD')
            original_open = Path.open
            def guarded_open(path, *args, **kwargs):
                if path == private:
                    raise AssertionError('Original content opened')
                return original_open(path, *args, **kwargs)
            with patch.object(Path, 'open', guarded_open):
                report = module.audit(repo)
            text = json.dumps(report)
            self.assertNotIn('NEVER_PUBLISH', text)
            self.assertEqual(report['protectedTrackedCount'], 1)
            self.assertEqual(report['records'][0]['additionCommits'], [first])
            self.assertEqual(report['consent'], 'NOT_VERIFIED')
            self.assertEqual(report['releaseDecision'], 'RELEASE_BLOCKED')
            self.assertFalse(report['shallowHistory'])

    def _synthetic_repo(self):
        temporary = tempfile.TemporaryDirectory(prefix='synthetic-git-metadata-')
        self.addCleanup(temporary.cleanup)
        repo = Path(temporary.name)
        def git(*args):
            return subprocess.check_output(
                ['git', '-C', str(repo), *args],
                stderr=subprocess.DEVNULL).decode().strip()
        git('init', '-b', 'main', '--template=')
        git('config', 'user.name', 'Synthetic operator')
        git('config', 'user.email', 'synthetic@example.invalid')
        git('config', 'commit.gpgsign', 'false')
        return repo, git

    def _module(self):
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        return module

    def test_deleted_protected_path_keeps_local_history_receipt(self):
        repo, git = self._synthetic_repo()
        private = repo / 'csv' / 'NEVER_PUBLISH_REMOVED.csv'
        private.parent.mkdir()
        private.write_text('NEVER_PUBLISH_CONTENT', encoding='utf-8')
        git('add', '.')
        git('commit', '-m', 'synthetic add')
        first = git('rev-parse', 'HEAD')
        git('rm', '--', 'csv/NEVER_PUBLISH_REMOVED.csv')
        git('commit', '-m', 'synthetic removal')

        report = self._module().audit(repo)

        self.assertEqual(len(report['records']), 1)
        self.assertEqual(report['protectedTrackedCount'], 0)
        self.assertEqual(report['protectedHistoricalCount'], 1)
        self.assertEqual(report['records'][0]['additionCommits'], [first])
        self.assertFalse(report['records'][0]['currentlyTracked'])
        self.assertEqual(report['historyCoverage'], 'AVAILABLE_LOCAL_REFS_ONLY')
        self.assertEqual(report['unreachableHistory'], 'NOT_VERIFIED')
        self.assertEqual(report['releaseDecision'], 'RELEASE_BLOCKED')
        self.assertNotIn('NEVER_PUBLISH', json.dumps(report))

    def test_protected_paths_on_another_local_branch_are_in_inventory(self):
        repo, git = self._synthetic_repo()
        git('commit', '--allow-empty', '-m', 'synthetic base')
        git('checkout', '-b', 'synthetic-other')
        for folder in ('forms_raw', 'private_identity_map'):
            private = repo / folder / 'NEVER_PUBLISH_BRANCH.json'
            private.parent.mkdir()
            private.write_text('NEVER_PUBLISH_CONTENT', encoding='utf-8')
        git('add', '.')
        git('commit', '-m', 'synthetic branch add')
        first = git('rev-parse', 'HEAD')
        git('checkout', 'main')

        report = self._module().audit(repo)

        self.assertEqual(len(report['records']), 2)
        self.assertEqual(report['protectedTrackedCount'], 0)
        self.assertEqual(report['protectedHistoricalCount'], 2)
        self.assertTrue(all(row['additionCommits'] == [first] for row in report['records']))
        self.assertNotIn('NEVER_PUBLISH', json.dumps(report))

    def test_git_pathspec_metacharacters_are_treated_as_literal_names(self):
        repo, git = self._synthetic_repo()
        folder = repo / 'private'
        folder.mkdir()
        (folder / '[receipt].csv').write_text('synthetic bracket', encoding='utf-8')
        git('add', '.')
        git('commit', '-m', 'synthetic bracket add')
        first = git('rev-parse', 'HEAD')
        (folder / 'r.csv').write_text('synthetic other', encoding='utf-8')
        git('add', '.')
        git('commit', '-m', 'synthetic other add')
        second = git('rev-parse', 'HEAD')

        report = self._module().audit(repo)
        receipts = {row['pathRef']: row['additionCommits'] for row in report['records']}

        import hashlib
        self.assertEqual(receipts[hashlib.sha256(b'private/[receipt].csv').hexdigest()[:16]], [first])
        self.assertEqual(receipts[hashlib.sha256(b'private/r.csv').hexdigest()[:16]], [second])

    def test_shallow_history_cannot_claim_an_introduction_is_resolved(self):
        repo, git = self._synthetic_repo()
        private = repo / 'csv' / 'synthetic.csv'
        private.parent.mkdir()
        private.write_text('synthetic', encoding='utf-8')
        git('add', '.')
        git('commit', '-m', 'synthetic first')
        first = git('rev-parse', 'HEAD')
        git('commit', '--allow-empty', '-m', 'synthetic shallow boundary')
        target = repo / 'shallow-copy'
        git('clone', '--depth=1', '--no-local', repo.as_uri(), str(target))

        report = self._module().audit(target)

        self.assertTrue(report['shallowHistory'])
        self.assertEqual(report.get('historyCoverage'), 'SHALLOW_LOCAL_REFS')
        self.assertEqual(report['records'][0]['historyState'], 'SHALLOW_UNRESOLVED')
        self.assertNotIn(first, report['records'][0]['additionCommits'])
        self.assertEqual(report['collaboratorCloneHistory'], 'NOT_VERIFIED')

    def test_historical_inventory_limit_still_applies_after_deletion(self):
        repo, git = self._synthetic_repo()
        folder = repo / 'csv'
        folder.mkdir()
        for number in range(101):
            (folder / f'synthetic-{number}.csv').write_text('synthetic', encoding='utf-8')
        git('add', '.')
        git('commit', '-m', 'synthetic bounded inventory')
        git('rm', '-r', '--', 'csv')
        git('commit', '-m', 'synthetic removal')

        with self.assertRaisesRegex(RuntimeError, '^Protected metadata exceeds bounded local review$'):
            self._module().audit(repo)

    def test_queries_only_read_metadata_and_disable_lazy_fetch(self):
        repo, git = self._synthetic_repo()
        private = repo / 'csv' / 'synthetic.csv'
        private.parent.mkdir()
        private.write_text('NEVER_PUBLISH_CONTENT', encoding='utf-8')
        git('add', '.')
        git('commit', '-m', 'synthetic metadata only')
        real_run = subprocess.run

        def metadata_only(command, **kwargs):
            self.assertIn('--literal-pathspecs', command)
            self.assertEqual(kwargs.get('env', {}).get('GIT_NO_LAZY_FETCH'), '1')
            self.assertEqual(kwargs.get('env', {}).get('GIT_ALLOW_PROTOCOL'), '')
            operation = command[command.index('-C') + 2]
            self.assertIn(operation, ('rev-parse', 'ls-files', 'log'))
            if operation == 'log':
                self.assertIn('--no-renames', command)
                self.assertIn('--no-ext-diff', command)
                self.assertIn('--no-textconv', command)
                self.assertNotIn('-p', command)
                self.assertNotIn('--patch', command)
            return real_run(command, **kwargs)

        with patch.object(subprocess, 'run', metadata_only), patch.object(
                Path, 'open', side_effect=AssertionError('Working file content opened')):
            report = self._module().audit(repo)
        self.assertEqual(report['protectedTrackedCount'], 1)
        self.assertNotIn('NEVER_PUBLISH_CONTENT', json.dumps(report))

    def test_failed_metadata_queries_never_include_private_git_diagnostics(self):
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, '^Git metadata unavailable$'):
                module.audit(Path(directory))


if __name__ == '__main__':
    unittest.main()
