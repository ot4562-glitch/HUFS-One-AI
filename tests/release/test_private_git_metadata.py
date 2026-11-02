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

    def test_failed_metadata_queries_never_include_private_git_diagnostics(self):
        module = importlib.util.module_from_spec(SPEC)
        SPEC.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, '^Git metadata unavailable$'):
                module.audit(Path(directory))


if __name__ == '__main__':
    unittest.main()
