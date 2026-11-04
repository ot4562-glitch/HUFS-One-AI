"""Run preview deployment orchestration only against an owned temporary sandbox.

All privileged, package and network commands are replaced at the process boundary;
ZIP validation, extraction, symlink activation and rollback are the real script.
No NCP, sudo, systemd service, npm package or network request is executed.
"""
from __future__ import annotations

import hashlib
import shlex
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "infra/ncp/deploy-preview.sh"


@unittest.skipUnless(os.name == "posix" and shutil.which("bash") and shutil.which("unzip"),
                     "Linux bash and unzip required for isolated script execution")
class PreviewActivationRecoveryTests(unittest.TestCase):
    def deploy(self, mode: str, previous: bool = True):
        with tempfile.TemporaryDirectory(prefix="hufs-preview-recovery-") as temporary:
            root = Path(temporary)
            base = root / "preview"
            base.mkdir()
            old = base / "previous"
            if previous:
                old.mkdir()
                (old / "marker").write_text("preserve previous release", encoding="utf-8")
                (base / "current").symlink_to(old)
            archive = root / "synthetic.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("package-lock.json", "{}")
                bundle.writestr("apps/web/src/main.tsx", "export {}")
                bundle.writestr("infra/ncp/deploy-preview.sh", "# synthetic only")
            expected = hashlib.sha256(archive.read_bytes()).hexdigest()
            source = SCRIPT.read_text(encoding="utf-8")
            # Redirect only fixed filesystem roots; execute the unchanged control flow.
            replacements = {
                "archive=/home/hufs-admin/ncp-preview.zip": "archive=" + str(archive),
                "base=/opt/hufs-one/preview": "base=" + str(base),
                "/tmp/hufs-preview-reviewed.XXXXXXXX.zip": str(root / "sealed.XXXXXXXX.zip"),
            }
            for before, after in replacements.items():
                self.assertEqual(source.count(before), 1)
                source = source.replace(before, after)
            script = root / "deploy.sh"
            script.write_text(source, encoding="utf-8")
            bin_dir = root / "bin"
            bin_dir.mkdir()
            shim = bin_dir / "command-shim"
            shim.write_text(textwrap.dedent("""\
                #!/bin/sh
                name=${0##*/}
                printf '%s\\n' "$name $*" >> "$SYNTHETIC_ROOT/commands.log"
                case "$name" in
                  id) [ "$*" = '-u' ] || exit 99; printf '0\\n';;
                  node) [ "$1" = '-p' ] || exit 99; printf '24\\n';;
                  stat)
                    [ "$1" = '-c' ] || exit 99
                    if [ "$2" = '%U' ]; then printf 'hufs-admin\\n'; else /usr/bin/stat "$@"; fi;;
                  systemctl)
                    [ "$#" -eq 2 ] && [ "$2" = hufs-preview.service ] || exit 99
                    if [ "$1" = enable ] && [ "$SYNTHETIC_MODE" = enable-failure ]; then exit 1; fi
                    if [ "$1" = restart ]; then
                      count=0
                      if [ -f "$SYNTHETIC_ROOT/restarts" ]; then read -r count < "$SYNTHETIC_ROOT/restarts"; fi
                      count=$((count+1)); printf '%s\\n' "$count" > "$SYNTHETIC_ROOT/restarts"
                      if [ "$SYNTHETIC_MODE" = rollback-failure ]; then exit 1; fi
                      if [ "$SYNTHETIC_MODE" = restart-failure ] && [ "$count" -eq 1 ]; then exit 1; fi
                    fi;;
                  curl) [ "$SYNTHETIC_MODE" != health-failure ] || exit 1;;
                  runuser) [ "$1" = '-u' ] && [ "$2" = hufs-preview ] && [ "$3" = '--' ] || exit 99;;
                  npm|chown|sleep|journalctl) :;;
                  *) exit 99;;
                esac
                exit 0
                """), encoding="utf-8")
            shim.chmod(0o755)
            for name in ("id", "node", "npm", "stat", "chown", "runuser", "systemctl", "curl", "sleep", "journalctl"):
                (bin_dir / name).symlink_to(shim)
            environment = {"PATH": str(bin_dir) + os.pathsep + os.environ.get("PATH", ""),
                           "SUDO_USER": "hufs-admin", "SYNTHETIC_ROOT": str(root),
                           "SYNTHETIC_MODE": mode, "HOME": str(root)}
            result = subprocess.run(["bash", str(script), expected], env=environment,
                                    capture_output=True, text=True, timeout=20)
            commands = [shlex.split(line) for line in (root / "commands.log").read_text().splitlines()]
            current = base / "current"
            destination = os.readlink(current) if current.is_symlink() else None
            if previous:
                self.assertEqual((old / "marker").read_text(), "preserve previous release")
            self.assertFalse(list(root.glob("sealed.*.zip")), "sealed upload must be removed")
            return result, commands, destination, str(old), str(base / "releases" / expected)

    def test_restart_failure_restores_previous_release(self):
        result, commands, current, old, _ = self.deploy("restart-failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(current, old)
        self.assertEqual(commands.count(["systemctl", "restart", "hufs-preview.service"]), 2)
        self.assertNotIn("OK: SYNTHETIC PREVIEW", result.stdout)

    def test_enable_failure_restores_previous_release(self):
        result, commands, current, old, _ = self.deploy("enable-failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(current, old)
        self.assertIn(["systemctl", "restart", "hufs-preview.service"], commands)

    def test_first_activation_failure_stops_service_and_removes_current_pointer(self):
        result, commands, current, _, _ = self.deploy("restart-failure", previous=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(current)
        self.assertIn(["systemctl", "stop", "hufs-preview.service"], commands)

    def test_health_failure_still_restores_previous_release(self):
        result, _, current, old, _ = self.deploy("health-failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(current, old)

    def test_failed_rollback_is_not_reported_as_success(self):
        result, commands, current, old, _ = self.deploy("rollback-failure")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(current, old)
        self.assertIn("manual recovery required", result.stderr)
        self.assertIn(["journalctl", "-u", "hufs-preview.service", "--no-pager", "-n", "20"], commands)
        self.assertNotIn("OK: SYNTHETIC PREVIEW", result.stdout)

    def test_success_keeps_the_new_release(self):
        result, commands, current, _, release = self.deploy("ok")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(current, release)
        self.assertEqual(commands.count(["systemctl", "restart", "hufs-preview.service"]), 1)
        self.assertIn("OK: SYNTHETIC PREVIEW", result.stdout)


if __name__ == "__main__":
    unittest.main()
