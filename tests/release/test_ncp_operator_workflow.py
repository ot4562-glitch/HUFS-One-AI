"""Operator-only NCP installer/deploy/rollback safety regressions.

No NCP API, actual root, SSH, real materials or network is used.
"""
from __future__ import annotations
from pathlib import Path
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
INSTALL = ROOT / "infra/ncp/setup/02-install-host.sh"
OPERATOR = ROOT / "infra/ncp/Operator-NcpPreview.ps1"
DEPLOY = ROOT / "infra/ncp/Deploy-NcpPreview.ps1"
BOOTSTRAP = ROOT / "infra/ncp/bootstrap-ubuntu.sh"
ROLLBACK = ROOT / "infra/ncp/rollback-preview.sh"


@unittest.skipUnless(os.name == "posix" and shutil.which("bash"),
                     "POSIX ownership/mode checks require Linux")
class InstallerBundleTrustTests(unittest.TestCase):
    def run_bundle(self, unsafe: str | None = None):
        with tempfile.TemporaryDirectory(prefix="hufs-installer-trust-") as temporary:
            root = Path(temporary)
            bundle = root / "reviewed" / "ncp"
            (bundle / "setup").mkdir(parents=True)
            marker = root / "bootstrap-called"
            # A harmless executable sentinel replaces only the approved bootstrap.
            bootstrap = bundle / "bootstrap-ubuntu.sh"
            bootstrap.write_text('#!/bin/bash\nprintf called > "$BUNDLE_TEST_MARKER"\n')
            for name in ["deploy-preview.sh", "harden-ssh.sh", "rollback-preview.sh", "hufs-preview.service"]:
                (bundle / name).write_text("synthetic reviewed companion\n")
            key = root / "admin.pub"
            key.write_text("synthetic public key\n")
            source = INSTALL.read_text(encoding="utf-8")
            # Filesystem checks remain real. Only the test UID/root boundary and
            # named key location differ; no sudo/packages/host operation exists.
            source = source.replace("expected_uid = 0", "expected_uid = " + str(os.getuid()))
            source = source.replace("trusted_root = pathlib.Path('/')", "trusted_root = pathlib.Path(" + repr(str(root)) + ")")
            source = source.replace("key_root = pathlib.Path('/root')", "key_root = pathlib.Path(" + repr(str(root)) + ")")
            script = bundle / "setup/02-install-host.sh"
            script.write_text(source)
            if unsafe == "companion-writable":
                (bundle / "deploy-preview.sh").chmod(0o666)
            elif unsafe == "parent-writable":
                bundle.parent.chmod(0o777)
            elif unsafe == "companion-link":
                companion = bundle / "rollback-preview.sh"
                companion.unlink()
                companion.symlink_to(bootstrap)
            elif unsafe == "bootstrap-writable":
                bootstrap.chmod(0o666)
            elif unsafe == "setup-writable":
                (bundle / "setup").chmod(0o777)
            elif unsafe == "key-writable":
                key.chmod(0o666)
            elif unsafe == "key-executable":
                key.chmod(0o777)
            elif unsafe == "key-link":
                target = root / "real-admin.pub"
                key.rename(target)
                key.symlink_to(target)
            elif unsafe == "key-traversal":
                key = root / "reviewed" / ".." / "admin.pub"
            bin_dir = root / "bin"
            bin_dir.mkdir()
            shim = bin_dir / "id"
            shim.write_text("#!/bin/sh\nprintf '0\\n'\n")
            shim.chmod(0o755)
            result = subprocess.run(["bash", str(script), "--apply", "--ack-owner-approved", "--ack-acg-verified",
                "--admin-public-key", str(key), "--admin-ip", "93.184.216.34/32", "--reviewed-bootstrap-sha256",
                hashlib.sha256(bootstrap.read_bytes()).hexdigest()],
                env={**os.environ, "PATH": str(bin_dir) + os.pathsep + os.environ["PATH"],
                     "BUNDLE_TEST_MARKER": str(marker)}, capture_output=True, text=True, timeout=10)
            return result, marker.exists()

    def test_trusted_bundle_reaches_only_synthetic_bootstrap(self):
        result, called = self.run_bundle()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(called)

    def test_unsafe_bundle_is_rejected_before_bootstrap(self):
        for unsafe in ["companion-writable", "parent-writable", "companion-link", "bootstrap-writable", "setup-writable",
                       "key-writable", "key-executable", "key-link", "key-traversal"]:
            with self.subTest(unsafe=unsafe):
                result, called = self.run_bundle(unsafe)
                self.assertNotEqual(result.returncode, 0, unsafe)
                self.assertFalse(called, "Untrusted bundle reached bootstrap")


class NcpOperatorWorkflowTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("bash"), "Bash required for synthetic CLI tests")
    def test_installer_default_plan_has_no_host_side_effect(self) -> None:
        # Feed exact script bytes: Linux Bash cannot interpret a Windows path.
        run = subprocess.run(["bash", "-s", "--", "--plan"], input=INSTALL.read_bytes(),
                             capture_output=True, timeout=10, check=False)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn(b"PLAN ONLY", run.stdout)
        self.assertIn(b"RELEASE_BLOCKED", run.stdout)
        self.assertIn(b"No NCP resource", run.stdout)

    @unittest.skipUnless(shutil.which("bash"), "Bash required for synthetic CLI tests")
    def test_installer_refuses_apply_without_separate_owner_and_acg_approval(self) -> None:
        for args in [[], ["--apply"], ["--apply", "--ack-owner-approved"],
                     ["--apply", "--ack-acg-verified"],
                     ["--apply", "--ack-owner-approved", "--ack-acg-verified"]]:
            command = ["bash", "-s", "--", *args]
            run = subprocess.run(command, input=INSTALL.read_bytes(), capture_output=True,
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
        self.assertIn("-hostkey $pins.Plink", text)
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
        self.assertIn("-hostkey $pins.Plink", deploy)
        self.assertIn("flock -n", rollback)
        self.assertIn("--expected-current", rollback)
        self.assertIn("healthy()", rollback)
        self.assertIn("--ack-owner-approved", rollback)
        # Previous service and release must remain recoverable on failure.
        self.assertRegex(rollback, r'(?s)Requested restore failed.*restoring the original preview')


@unittest.skipUnless(os.name == "posix", "POSIX key ownership/modes required")
class PublicKeyPathTests(unittest.TestCase):
    def test_installer_and_direct_bootstrap_enforce_identical_key_boundary(self):
        validators = [source.read_text(encoding="utf-8").split("<<'PUBLIC_KEY_PATH'\n", 1)[1]
                      .split("\nPUBLIC_KEY_PATH\n", 1)[0] for source in (INSTALL, BOOTSTRAP)]
        self.assertEqual(validators[0], validators[1])
        # CI also executes this as root on Ubuntu 22.04/24.04. Locally only the
        # trusted root/UID are substituted; actual lstat/resolve/mode checks run.
        with tempfile.TemporaryDirectory(prefix="hufs-key-boundary-") as temporary:
            root = Path(temporary)
            trusted = root / "root"
            trusted.mkdir(mode=0o700)
            validator = validators[0].replace("expected_uid = 0", f"expected_uid = {os.getuid()}")
            validator = validator.replace("key_root = pathlib.Path('/root')", f"key_root = pathlib.Path({str(trusted)!r})")
            key = trusted / "admin.pub"
            key.write_text("synthetic public key\n")
            def check(path, valid):
                result = subprocess.run([sys.executable, "-c", validator, str(path)],
                                        capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode == 0, valid, f"{path}: {result.stderr}")
            for mode in (0o600, 0o644):
                key.chmod(mode)
                check(key, True)
            for mode in (0o666, 0o777, 0o664, 0o602, 0o1644):
                key.chmod(mode)
                check(key, False)
            key.chmod(0o600)
            check(trusted / ".." / "root" / "admin.pub", False)
            escaped = root / "outside.pub"
            escaped.write_text("synthetic public key\n")
            escaped.chmod(0o600)
            check(trusted / ".." / "outside.pub", False)
            link = trusted / "link.pub"
            link.symlink_to(key)
            check(link, False)
            subdir = trusted / "nested"
            subdir.mkdir()
            nested = subdir / "admin.pub"
            nested.write_text("synthetic public key\n")
            nested.chmod(0o600)
            check(nested, False)
            parent_link = root / "linked-root"
            parent_link.symlink_to(trusted, target_is_directory=True)
            check(parent_link / "admin.pub", False)
            trusted.chmod(0o777)
            check(key, False)
            trusted.chmod(0o700)
            if os.getuid() == 0:
                os.chown(key, 65534, -1)
                check(key, False)

    def test_ubuntu_admin_ip_policy_accepts_one_prefix_and_rejects_nonpublic_hosts(self):
        sources = [INSTALL.read_text(encoding="utf-8"), BOOTSTRAP.read_text(encoding="utf-8")]
        for source in sources:
            marker = 'python3 - "$admin"' if 'python3 - "$admin"' in source else 'python3 - "$ADMIN_IP"'
            validator = source.split(marker + " <<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
            for ip in ("1.1.1.1", "8.8.8.8", "93.184.216.34", "192.0.0.9", "192.0.0.10"):
                run = subprocess.run([sys.executable, "-c", validator, ip + "/32"], capture_output=True)
                self.assertEqual(run.returncode, 0, run.stderr)
            for ip in ("0.1.1.1", "10.0.0.1", "127.0.0.1", "100.64.0.1", "169.254.1.1", "172.16.0.1",
                       "192.168.1.1", "192.0.0.8", "192.0.0.170", "192.0.2.1", "198.18.0.1", "198.19.255.255",
                       "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255", "01.1.1.1"):
                run = subprocess.run([sys.executable, "-c", validator, ip + "/32"], capture_output=True)
                self.assertNotEqual(run.returncode, 0, ip)

if __name__ == "__main__":
    unittest.main()
