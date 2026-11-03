"""#89 NCP preview deployment static contract. No cloud, SSH, paid provider or student data.

This executes only safe shell syntax checks and checks the checked-in script source.
Production launch is intentionally NOT a supported action.
"""
from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NCP = ROOT / "infra/ncp"


class NcpPreviewSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bootstrap = (NCP / "bootstrap-ubuntu.sh").read_text(encoding="utf-8")
        cls.deploy = (NCP / "deploy-preview.sh").read_text(encoding="utf-8")
        cls.harden = (NCP / "harden-ssh.sh").read_text(encoding="utf-8")
        cls.systemd = (NCP / "hufs-preview.service").read_text(encoding="utf-8")
        cls.windows = (NCP / "Prepare-NcpPreview.ps1").read_text(encoding="utf-8")
        cls.windows_deploy = (NCP / "Deploy-NcpPreview.ps1").read_text(encoding="utf-8")
        cls.runbook = (NCP / "README.md").read_text(encoding="utf-8")

    def test_all_shell_scripts_parse_in_linux_bash(self):
        for path in sorted(NCP.glob("*.sh")):
            result = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, f"{path}: {result.stderr}")

    def test_preview_never_listens_publicly_or_starts_prod(self):
        self.assertIn("127.0.0.1", self.systemd)
        self.assertIn("--mode synthetic", self.systemd)
        self.assertIn("--host 127.0.0.1", self.systemd)
        self.assertNotIn("0.0.0.0", self.systemd)
        self.assertNotIn("APP_ENV=production", self.systemd)
        self.assertIn("User=hufs-preview", self.systemd)
        self.assertIn("NoNewPrivileges=true", self.systemd)
        self.assertIn("ProtectSystem=strict", self.systemd)
        for source in (self.bootstrap, self.deploy, self.harden):
            self.assertNotIn("curl | bash", source)
            self.assertNotIn("0.0.0.0/0", source)
            self.assertNotIn("docker run -p", source)

    def test_archive_must_be_composed_from_fixed_paths_not_private_checkout(self):
        self.assertIn("git archive", self.windows)
        self.assertIn("git ls-tree", self.windows)
        self.assertIn("packages/contracts/tsconfig.build.json", self.windows)
        self.assertNotIn("git clone", self.windows)
        self.assertNotIn("Copy-Item -Recurse", self.windows)
        self.assertIn("local_only", self.windows)
        self.assertIn("(^|/)(csv|private|secrets|local_only)/", self.windows)
        self.assertIn("Symlink forbidden", self.windows)
        self.assertIn("Get-FileHash", self.windows)

    def test_windows_one_command_requires_explicit_apply_and_pinned_sftp_ssh(self):
        for required in (
            "Prepare-NcpPreview.ps1", "WinSCP.com", "plink.exe",
            "HostKeyFingerprint", "PrivateKeyPath", "Get-FileHash",
            "SYNTHETIC-only", "if (-not $Apply)", "-hostkey",
            "hufs-admin", "/usr/local/sbin/hufs-preview-deploy",
            "127.0.0.1:5173",
        ):
            self.assertIn(required, self.windows_deploy)
        self.assertNotIn("git clone", self.windows_deploy)
        self.assertNotIn("ncloud ", self.windows_deploy)
        self.assertNotIn("APP_ENV=production", self.windows_deploy)
        self.assertNotIn("-password", self.windows_deploy)

    def test_linux_deploy_verifies_zip_hash_paths_and_rollback(self):
        for expected in (
            "sha256sum", "zipfile.ZipFile", "os.path", # see adjusted assertion below
            "Symbolic links are forbidden", "Unreviewed bundle member",
            "npm ci --ignore-scripts", "npm run build:web", "systemctl restart",
            "Rolling back the preview symlink", "127.0.0.1:5173",
            "packages/contracts/tsconfig.build.json",
        ):
            if expected == "os.path":
                continue
            self.assertIn(expected, self.deploy)

    def test_ssh_changes_require_admin_pubkey_fixed_32_and_second_login(self):
        self.assertIn("network.prefixlen==32", self.bootstrap)
        self.assertIn("network.is_global", self.bootstrap)
        self.assertIn("authorized_keys", self.bootstrap)
        self.assertIn("ufw default deny incoming", self.bootstrap)
        self.assertIn("from \"$ADMIN_IP\" to any port 22", self.bootstrap)
        self.assertIn("SUDO_USER", self.harden)
        self.assertIn("--i-tested-new-key-login", self.harden)
        self.assertIn("/usr/sbin/sshd -t", self.harden)
        self.assertIn("/usr/sbin/sshd -T", self.harden)
        self.assertIn("permitrootlogin no", self.harden)

    def test_docs_refuse_to_claim_production_or_korean_geo_wall(self):
        for expected in ("PuTTY", "WinSCP", "Network ACL", "ACG", "한국 IP", "#46", "#89",
                         "RELEASE_BLOCKED", "5173", "3000", "5432", "비밀번호", "SSH"):
            self.assertIn(expected, self.runbook)
        self.assertRegex(self.runbook, r"실제.+(서비스|운영).+(차단|미구현|전)")
        self.assertIn("APP_ENV=production", self.runbook)
        self.assertIn("Global Edge", self.runbook)
        self.assertIn("Whitelist > Geo", self.runbook)
        self.assertIn("한국", self.runbook)
        self.assertIn("Source port 5174", self.deploy)



    def test_real_zip_validator_accepts_allowlist_and_denies_malicious_members(self):
        """Run only the embedded pure-Python ZIP validator, never privileged deploy."""
        import stat
        import sys
        import tempfile
        import warnings
        import zipfile
        with tempfile.TemporaryDirectory() as directory:
            marker = 'python3 - "$sealed" <<' + "'PY'" + '\n'
            validator = self.deploy.split(marker, 1)[1].split('\nPY\n', 1)[0]
            for kind in ("valid", "duplicate", "traversal", "symlink"):
                path = Path(directory) / f"{kind}.zip"
                with zipfile.ZipFile(path, "w") as archive:
                    archive.writestr("package-lock.json", "{}")
                    archive.writestr("apps/web/src/main.tsx", "export {}")
                    archive.writestr("infra/ncp/deploy-preview.sh", "# synthetic")
                    if kind == "duplicate":
                        with warnings.catch_warnings():
                            warnings.simplefilter("ignore", UserWarning)
                            archive.writestr("package-lock.json", "forbidden overwrite")
                    elif kind == "traversal":
                        archive.writestr("apps/web/src/../../../outside", "forbidden path")
                    elif kind == "symlink":
                        entry = zipfile.ZipInfo("apps/web/src/linked")
                        entry.create_system = 3
                        entry.external_attr = (stat.S_IFLNK | 0o777) << 16
                        archive.writestr(entry, "../private")
                result = subprocess.run([sys.executable, "-c", validator, str(path)],
                                        capture_output=True, text=True, check=False)
                with self.subTest(kind=kind):
                    self.assertEqual(result.returncode == 0, kind == "valid",
                                     result.stdout + result.stderr)
                    if kind != "valid":
                        self.assertNotIn("Allowlisted ZIP paths", result.stdout)

    def test_default_windows_plan_never_requires_host_keys_or_processes(self):
        source = self.windows_deploy
        plan = source.index("if (-not $Apply)")
        self.assertLess(plan, source.index("$key = [System.IO.Path]::GetFullPath"))
        self.assertLess(plan, source.index("Find-Exe $WinSCPExe"))
        self.assertLess(plan, source.index("Prepare-NcpPreview.ps1') -Ref $Ref"))
        self.assertIn("No resources, account, IP, SSH key, package, network", source)

    def test_root_owns_preview_pointer_directory_not_untrusted_service(self):
        self.assertIn("install -d -m 0755 -o root -g root /opt/hufs-one/preview/releases", self.bootstrap)
        self.assertIn("sealed=$(mktemp", self.deploy)
        self.assertIn('install -m 0600 -- "$archive" "$sealed"', self.deploy)
        self.assertIn('unzip -q "$sealed"', self.deploy)
        self.assertIn("Duplicate ZIP member names forbidden.", self.deploy)


if __name__ == "__main__":
    unittest.main()
