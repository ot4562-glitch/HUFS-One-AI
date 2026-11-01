"""Release is blocked without real external validators and human approval."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

from tools.release_readiness_gate import EXTERNAL_UNVERIFIED, OFFLINE, evaluate_release

ROOT = Path(__file__).resolve().parents[2]
MANUAL_WORKFLOW = ROOT / ".github/workflows/release-readiness.yml"
GATE = ROOT / "tools/release_readiness_gate.py"


def manual_release_workflow_problems(source: str) -> list[str]:
    problems: list[str] = []
    if not re.search(r"(?m)^  workflow_dispatch:\s*$", source):
        problems.append("manual dispatch missing")
    if re.search(r"(?m)^  (?:push|pull_request|pull_request_target|release|schedule):",
                 source):
        problems.append("unsafe automatic release trigger")
    if "permissions:\n  contents: read" not in source:
        problems.append("read-only permissions missing")
    if "persist-credentials: false" not in source:
        problems.append("checkout credentials persisted")
    if "sparse-checkout-cone-mode: false" not in source:
        problems.append("sparse checkout missing")
    checkout = re.search(
        r"(?m)^          sparse-checkout: \|\n((?: {12}[^\n]+\n)+)", source
    )
    if (not checkout or checkout.group(1).splitlines() != [
        "            /tools/release_readiness_gate.py"
    ]):
        problems.append("manual checkout expanded beyond gate")
    if ("secrets." in source or "id-token: write" in source
        or "actions/upload-artifact@" in source):
        problems.append("privileged or publication side effect")
    if "run: python3 tools/release_readiness_gate.py" not in source:
        problems.append("release blocker not invoked")
    return problems


class ReleaseReadinessTests(unittest.TestCase):
    def test_no_offline_evidence_means_blocked_external(self) -> None:
        report = evaluate_release()
        self.assertEqual(report["release"], "BLOCKED")
        self.assertEqual(report["status"], "BLOCKED")
        self.assertEqual(report["blocker"], "BLOCKED_EXTERNAL")
        self.assertEqual(len(report["gates"]), len(OFFLINE) + len(EXTERNAL_UNVERIFIED))
        self.assertTrue(all(gate["status"] == "NOT_RUN" for gate in report["gates"]))

    def test_all_synthetic_passes_cannot_promote_release(self) -> None:
        report = evaluate_release({name: "PASS" for name in OFFLINE})
        self.assertEqual(report["release"], "BLOCKED")
        self.assertEqual(report["blocker"], "BLOCKED_EXTERNAL")
        self.assertTrue(all(gate["status"] == "NOT_RUN"
                            for gate in report["gates"][len(OFFLINE):]))

    def test_missing_and_failed_offline_gate_stay_distinct(self) -> None:
        report = evaluate_release({OFFLINE[0]: "FAIL", OFFLINE[1]: "PASS"})
        self.assertEqual(report["blocker"], "BLOCKED_SECURITY")
        self.assertEqual(report["gates"][0]["status"], "FAIL")
        self.assertEqual(report["gates"][1]["status"], "PASS")
        self.assertEqual(report["gates"][2]["status"], "NOT_RUN")

    def test_unrecognized_status_is_not_trusted(self) -> None:
        report = evaluate_release({OFFLINE[0]: "VERIFIED_BY_FLAG"})
        self.assertEqual(report["gates"][0]["status"], "FAIL")
        self.assertEqual(report["blocker"], "BLOCKED_SECURITY")

    def test_manual_cli_exits_nonzero_even_with_untrusted_release_flags(self) -> None:
        env = dict(os.environ)
        env.update(RELEASE_READY="true", AUTH_REQUIRED="true", NCP_VERIFIED="true")
        completed = subprocess.run([sys.executable, str(GATE)],
                                   cwd=ROOT, env=env, text=True, capture_output=True,
                                   timeout=8, check=False)
        self.assertEqual(completed.returncode, 2)
        self.assertEqual(json.loads(completed.stdout)["release"], "BLOCKED")
        self.assertNotIn("NCP_VERIFIED", completed.stdout)
        self.assertEqual(completed.stderr, "")

    def test_runtime_override_argument_is_rejected(self) -> None:
        completed = subprocess.run([sys.executable, str(GATE), "--allow-release"],
                                   cwd=ROOT, capture_output=True, text=True,
                                   timeout=8, check=False)
        self.assertEqual(completed.returncode, 2)
        self.assertEqual(json.loads(completed.stdout)["error"], "NO_RUNTIME_OVERRIDE")

    def test_manual_workflow_uses_only_read_only_release_gate_checkout(self) -> None:
        self.assertEqual(manual_release_workflow_problems(
            MANUAL_WORKFLOW.read_text(encoding="utf-8")), [])

    def test_privileged_dispatch_or_broadened_checkout_is_rejected(self) -> None:
        source = MANUAL_WORKFLOW.read_text(encoding="utf-8")
        for modified in (
            source.replace("contents: read", "contents: write", 1),
            source.replace("  workflow_dispatch:", "  pull_request_target:", 1),
            source.replace("/tools/release_readiness_gate.py\n",
                           "/tools/release_readiness_gate.py\n            /csv/\n", 1),
            source.replace("run: python3 tools/release_readiness_gate.py", "run: true", 1),
            source + "\n# synthetic only\nsecrets.UNSAFE\n",
        ):
            with self.subTest(changed=modified != source):
                self.assertTrue(manual_release_workflow_problems(modified))


if __name__ == "__main__":
    unittest.main()
