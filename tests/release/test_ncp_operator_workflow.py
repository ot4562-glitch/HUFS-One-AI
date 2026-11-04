"""Operator-only NCP installer/deploy/rollback safety regressions.

No NCP API, actual root, SSH, real materials or network is used.
"""
from __future__ import annotations
from pathlib import Path
import re
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
INSTALL = ROOT / "infra/ncp/setup/02-install-host.sh"
OPERATOR = ROOT / "infra/ncp/Operator-NcpPreview.ps1"
DEPLOY = ROOT / "infra/ncp/Deploy-NcpPreview.ps1"
ROLLBACK = ROOT / "infra/ncp/rollback-preview.sh"

class NcpOperatorWorkflowTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("bash"), "Bash required for synthetic CLI tests")
    def test_installer_default_plan_has_no_host_side_effect(self) -> None:
        run = subprocess.run(["bash", str(INSTALL), "--plan"],
                             capture_output=True, text=True, timeout=10, check=False)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("PLAN ONLY", run.stdout)
        self.assertIn("RELEASE_BLOCKED", run.stdout)
        self.assertIn("No NCP resource", run.stdout)

    @unittest.skipUnless(shutil.which("bash"), "Bash required for synthetic CLI tests")
    def test_installer_refuses_apply_without_separate_owner_and_acg_approval(self) -> None:
        for args in [[], ["--apply"], ["--apply", "--ack-owner-approved"],
                     ["--apply", "--ack-acg-verified"],
                     ["--apply", "--ack-owner-approved", "--ack-acg-verified"]]:
            command = ["bash", str(INSTALL), *args]
            run = subprocess.run(command, capture_output=True, text=True,
                                 timeout=10, check=False)
            self.assertNotEqual(run.returncode, 0, "Unapproved installer ran")
        source = INSTALL.read_text(encoding="utf-8")
        self.assertIn("--reviewed-bootstrap-sha256", source)
        self.assertIn("sha256sum", source)
        self.assertIn("ack-owner-approved", source)
        self.assertIn("ack-acg-verified", source)
        self.assertIn("bootstrap-ubuntu.sh", source)
        self.assertIn("exec bash", source)

    def test_operator_defaults_plan_and_requires_pin_before_remote_execution(self) -> None:
        text = OPERATOR.read_text(encoding="utf-8")
        self.assertIn("[string]$Operation = 'Plan'", text)
        self.assertIn("if ($Operation -eq 'Plan')", text)
        self.assertIn("if (-not $Apply -or -not $OwnerApproved)", text)
        self.assertIn("-hostkey $HostKeyFingerprint", text)
        self.assertIn("-batch -ssh -P 22", text)
        self.assertIn("/usr/local/sbin/hufs-preview-rollback", text)
        self.assertIn("--expected-current", text)
        self.assertIn("--apply --ack-owner-approved", text)
        self.assertIn("Deploy-NcpPreview.ps1", text)
        self.assertIn("127.0.0.1:5173", text)
        self.assertNotIn("Invoke-Expression", text)
        self.assertNotIn("StrictHostKeyChecking=no", text)
        self.assertNotIn("UserKnownHostsFile=/dev/null", text)
        self.assertNotIn("0.0.0.0:5173", text)

    def test_existing_deployment_and_recovery_fail_closed(self) -> None:
        deploy = DEPLOY.read_text(encoding="utf-8")
        rollback = ROLLBACK.read_text(encoding="utf-8")
        self.assertIn("if (-not $Apply)", deploy)
        self.assertIn("Prepare-NcpPreview.ps1", deploy)
        self.assertIn("-hostkey $HostKeyFingerprint", deploy)
        self.assertIn("flock -n", rollback)
        self.assertIn("--expected-current", rollback)
        self.assertIn("healthy()", rollback)
        self.assertIn("--ack-owner-approved", rollback)
        # Previous service and release must remain recoverable on failure.
        self.assertRegex(rollback, r'(?s)Requested restore failed.*restoring the original preview')

if __name__ == "__main__":
    unittest.main()
