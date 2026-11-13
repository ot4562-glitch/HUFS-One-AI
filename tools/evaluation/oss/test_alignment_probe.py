import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest

PROBE = Path(__file__).with_name('alignment_probe.py')


class AlignmentProbeTests(unittest.TestCase):
    def module(self):
        self.assertTrue(PROBE.exists(), 'LangExtract alignment probe is missing')
        spec = importlib.util.spec_from_file_location('alignment_probe', PROBE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_metric_rejects_wrong_occurrence_and_keeps_hallucinations_in_denominator(self):
        m = self.module()
        case = {'text': '서울 또는 서울', 'expected': [{'kind': 'campus', 'value': '서울', 'start': 6, 'end': 8}]}
        self.assertEqual(m.score(case, [{'kind': 'campus', 'value': '서울', 'start': 0, 'end': 2}])['exactSpans'], {'num': 0, 'den': 1})
        self.assertEqual(m.score(case, [{'kind': 'campus', 'value': '서울', 'start': 6, 'end': 8}])['exactSpans'], {'num': 1, 'den': 1})
        self.assertEqual(m.score(case, [])['exactSpans'], {'num': 0, 'den': 1})
        self.assertEqual(m.score(case, [{'kind': 'year', 'value': '2027', 'start': None, 'end': None}])['unlocated'], {'num': 1, 'den': 1})
        self.assertEqual(m.score(case, [{'kind': 'campus', 'value': '서울', 'start': 3, 'end': 5}])['literalSpans'], {'num': 0, 'den': 1})
        self.assertEqual(m.score(case, [{'kind': 'campus', 'value': '서울', 'start': 6, 'end': 8}] * 2)['exactSpans'], {'num': 1, 'den': 1})

    @unittest.skipUnless(os.environ.get('HUFS_LANGEXTRACT_PYTHON'), 'Optional pinned venv not selected')
    def test_actual_library_uses_only_canned_model_and_hashes_each_fixed_case(self):
        self.module()
        report = json.loads(subprocess.check_output([os.environ['HUFS_LANGEXTRACT_PYTHON'], str(PROBE)], timeout=45,
                            env={k: v for k, v in os.environ.items() if k in {'SystemRoot', 'WINDIR', 'TEMP', 'TMP'}}, stderr=subprocess.PIPE))
        self.assertEqual(report['toolVersion'], '1.6.0')
        self.assertEqual(report['model'], 'CANNED_RESPONSES_NOT_LLM_INFERENCE')
        self.assertEqual(report['attempts'], {'network': 0, 'subprocess': 0})
        self.assertFalse(report['releaseEligible'])
        self.assertEqual(len(report['cases']), 6)
        self.assertEqual(report['externalModelCalls'], 0)
        self.assertEqual(report['cases'][0]['metrics']['exactSpans'], {'num': 3, 'den': 3})
        self.assertEqual(report['cases'][2]['metrics']['unlocated'], {'num': 1, 'den': 1})
        self.assertEqual(report['cases'][3]['metrics']['exactSpans'], {'num': 0, 'den': 1})
        self.assertEqual(report['cases'][4]['observed'][0]['start'], 2)
        for case in report['cases']:
            self.assertRegex(case['inputSha256'], r'^[a-f0-9]{64}$')
            self.assertRegex(case['cannedResponseSha256'], r'^[a-f0-9]{64}$')
            self.assertEqual(case['inferencePrompts'], 1)
        rejected = subprocess.run([os.environ['HUFS_LANGEXTRACT_PYTHON'], str(PROBE), '--input', 'student.txt'],
                                  capture_output=True, timeout=10)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertEqual(rejected.stdout, b'')
        self.assertNotIn(b'student.txt', rejected.stderr)


if __name__ == '__main__':
    unittest.main()
