from __future__ import annotations

import unittest
from tools.release_readiness_gate import OFFLINE, evaluate_release


class OwnerAuthorizationTests(unittest.TestCase):
    def test_owner_approval_is_recorded_without_manufacturing_live_test_results(self):
        result = evaluate_release({name: 'PASS' for name in OFFLINE})
        self.assertEqual(result['authorization'], 'OWNER_CONFIRMED_APPROVED')
        self.assertEqual(result['execution'], 'LIVE_VERIFICATION_REQUIRED')
        self.assertEqual(result['blocker'], 'BLOCKED_EXTERNAL')
        self.assertNotIn('NO_EXTERNAL_VALIDATOR_OR_OPERATIONAL_APPROVAL', result['reason_codes'])
        self.assertIn('LIVE_EXECUTION_NOT_VERIFIED', result['reason_codes'])

    def test_approval_does_not_suppress_a_real_security_failure(self):
        result = evaluate_release({OFFLINE[0]: 'FAIL'})
        self.assertEqual(result['authorization'], 'OWNER_CONFIRMED_APPROVED')
        self.assertEqual(result['blocker'], 'BLOCKED_SECURITY')
        self.assertEqual(result['gates'][0]['status'], 'FAIL')


if __name__ == '__main__':
    unittest.main()
