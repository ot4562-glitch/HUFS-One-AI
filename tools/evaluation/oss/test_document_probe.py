"""No dependency installation: optional converters run only in the selected venv."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest

PROBE = Path(__file__).with_name('document_probe.py')


class DocumentProbeTests(unittest.TestCase):
    def module(self):
        self.assertTrue(PROBE.exists(), 'PDF/Office synthetic probe is missing')
        spec = importlib.util.spec_from_file_location('document_probe', PROBE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_fixed_fixtures_are_deterministic_and_cover_formats(self):
        module = self.module()
        first, second = module.fixtures(), module.fixtures()
        self.assertEqual(first, second)
        self.assertEqual(len(first), 6)
        self.assertEqual({x['format'] for x in first}, {'pdf', 'docx'})
        self.assertEqual(sum(x.get('expectEmpty', False) for x in first), 1)
        self.assertTrue(any(x.get('tableRows') for x in first))
        for case in first:
            self.assertLess(len(case['bytes']), 100_000)
            self.assertTrue(case['bytes'].startswith(b'%PDF-' if case['format'] == 'pdf' else b'PK'))

    def test_scoring_keeps_missing_fragments_and_broken_table_rows(self):
        module = self.module()
        case = {'expected': ['서울', '2027'], 'tableRows': [['서울', '2027']], 'expectEmpty': False}
        score = module.score(case, '서울\n\n2027')
        self.assertEqual(score['fragments'], {'num': 2, 'den': 2})
        self.assertEqual(score['tableRows'], {'num': 0, 'den': 1})
        score = module.score(case, '| 서울 | 2027 |')
        self.assertEqual(score['tableRows'], {'num': 1, 'den': 1})
        self.assertEqual(module.score(case, '')['fragments'], {'num': 0, 'den': 2})
        self.assertEqual(module.score({'expected': [], 'expectEmpty': True}, 'invented')['empty'], {'num': 0, 'den': 1})

    @unittest.skipUnless(os.environ.get('HUFS_MARKITDOWN_PYTHON'), 'Optional pinned venv not selected')
    def test_actual_converters_have_no_external_operations_and_complete_provenance(self):
        self.module()
        result = subprocess.run([os.environ['HUFS_MARKITDOWN_PYTHON'], str(PROBE)],
                                capture_output=True, timeout=45, check=True,
                                env={k: v for k, v in os.environ.items() if k in {'SystemRoot', 'WINDIR', 'TEMP', 'TMP'}})
        report = json.loads(result.stdout)
        self.assertEqual(report['referenceKind'], 'AUTHOR_SYNTHETIC_NOT_HUMAN_GOLD')
        self.assertFalse(report['releaseEligible'])
        self.assertEqual(report['attempts'], {'network': 0, 'subprocess': 0})
        self.assertEqual(report['baseline']['state'], 'UNSUPPORTED_BINARY_FORMATS')
        self.assertEqual(len(report['cases']), 6)
        self.assertEqual(report['toolVersion'], '0.1.9')
        self.assertEqual(report['externalModelCalls'], 0)
        self.assertEqual(report['cases'][-1]['metrics']['empty'], {'num': 1, 'den': 1})
        for case in report['cases']:
            self.assertRegex(case['originalSha256'], r'^[a-f0-9]{64}$')
            self.assertRegex(case['outputSha256'], r'^[a-f0-9]{64}$')
            if not case['id'].endswith('IMAGE'):
                self.assertGreater(case['metrics']['fragments']['den'], 0)
        rejected = subprocess.run([os.environ['HUFS_MARKITDOWN_PYTHON'], str(PROBE), '--input', 'student.pdf'],
                                  capture_output=True, timeout=10)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertEqual(rejected.stdout, b'')
        self.assertNotIn(b'student.pdf', rejected.stderr)


if __name__ == '__main__':
    unittest.main()
