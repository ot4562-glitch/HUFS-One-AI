"""PowerShell 5.1/native argv regressions using network-incapable executable stubs.

The actual Deploy/Operator scripts run with a synthetic package writer, .ppk
placeholder and compiled local console programs. This is not WinSCP/plink or NCP
acceptance; it verifies pin representation, PS/native quoting and fail-closed
orchestration without a server, credentials or any network code.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
POWERSHELL = shutil.which("powershell")
DIGEST = base64.b64encode(bytes(range(32))).decode().rstrip("=")


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


@unittest.skipUnless(os.name == "nt" and POWERSHELL, "Windows PowerShell 5.1 required")
class WindowsPreviewBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="hufs ncp offline ")
        cls.root = Path(cls.temporary.name)
        cls.repo = cls.root / "repo with spaces"
        cls.scripts = cls.repo / "infra/ncp"
        cls.scripts.mkdir(parents=True)
        for name in ("Deploy-NcpPreview.ps1", "Operator-NcpPreview.ps1", "NcpPreview.Common.ps1"):
            shutil.copyfile(ROOT / "infra/ncp" / name, cls.scripts / name)
        (cls.scripts / "Prepare-NcpPreview.ps1").write_text(
            "param([string]$Ref)\n"
            "$zip = Join-Path $PSScriptRoot '..\\..\\local_only\\ncp-preview.zip'\n"
            "New-Item -ItemType Directory -Force (Split-Path -Parent $zip) | Out-Null\n"
            "[IO.File]::WriteAllText($zip, 'synthetic package')\n"
            "$global:LASTEXITCODE = 0\n", encoding="utf-8")
        cls.key = cls.root / "key with spaces.ppk"
        cls.key.write_text("synthetic placeholder, not a private key\n")
        cls.tools = cls.root / "tools with spaces"
        cls.tools.mkdir()
        cls.plink = cls.tools / "plink.exe"
        cls.winscp = cls.tools / "WinSCP.com"
        cls.log = cls.root / "native-calls.txt"
        cls.script_copy = cls.root / "winscp-script.txt"
        cls.script_path = cls.root / "winscp-script-path.txt"
        cls.argv = cls.root / "native-argv.txt"
        cls.env = dict(os.environ)
        cls.env.pop("PSModulePath", None)
        cls.env["PSModulePath"] = str(Path(POWERSHELL).parent / "Modules")
        cls.env.update(NCP_TEST_LOG=str(cls.log), NCP_TEST_SCRIPT=str(cls.script_copy),
                       NCP_TEST_ARGV=str(cls.argv), NCP_TEST_DIGEST=DIGEST,
                       NCP_TEST_SCRIPT_PATH=str(cls.script_path))
        # No sockets/process execution in this binary. Its argument parser and
        # exit status exercise PS 5.1's real native executable invocation.
        code = cls.root / "stub.cs"
        code.write_text(r'''
using System;
using System.IO;
using System.Text.RegularExpressions;
class NativeStub {
  static int Main(string[] argv) {
    bool upload = argv.Length > 0 && argv[0] == "/ini=nul";
    File.AppendAllText(Environment.GetEnvironmentVariable("NCP_TEST_LOG"), upload ? "upload\n" : "ssh\n");
    File.WriteAllLines(Environment.GetEnvironmentVariable("NCP_TEST_ARGV"), argv);
    string digest = Environment.GetEnvironmentVariable("NCP_TEST_DIGEST");
    if (upload) {
      if (argv.Length != 2 || !argv[1].StartsWith("/script=")) return 10;
      string path = argv[1].Substring(8);
      File.WriteAllText(Environment.GetEnvironmentVariable("NCP_TEST_SCRIPT_PATH"), path);
      string script = File.ReadAllText(path);
      File.WriteAllText(Environment.GetEnvironmentVariable("NCP_TEST_SCRIPT"), script);
      if (!script.Contains("-hostkey=\"ssh-ed25519 255 " + digest + "=\"")) return 11;
      Match key = Regex.Match(script, "-privatekey=\"([^\"]+)\"");
      Match zip = Regex.Match(script, "put \"([^\"]+)\"");
      if (!key.Success || !zip.Success || !File.Exists(key.Groups[1].Value) || !File.Exists(zip.Groups[1].Value)) return 12;
      return Environment.GetEnvironmentVariable("NCP_TEST_FAIL_UPLOAD") == "1" ? 13 : 0;
    }
    int pinIndex = Array.IndexOf(argv, "-hostkey");
    int keyIndex = Array.IndexOf(argv, "-i");
    if (pinIndex < 0 || argv[pinIndex + 1] != "SHA256:" + digest || keyIndex < 0 || !File.Exists(argv[keyIndex + 1])) return 14;
    return 0;
  }
}
''', encoding="utf-8")
        compile_script = cls.root / "compile.ps1"
        compile_script.write_text(
            "$ErrorActionPreference = 'Stop'\n"
            "if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'PowerShell 5.1 required' }\n"
            f"Add-Type -Path {literal(code)} -OutputAssembly {literal(cls.plink)} -OutputType ConsoleApplication\n",
            encoding="utf-8")
        run = subprocess.run([POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(compile_script)],
                             env=cls.env, capture_output=True, text=True, timeout=30)
        if run.returncode:
            raise AssertionError(run.stdout + run.stderr)
        shutil.copyfile(cls.plink, cls.winscp)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def setUp(self):
        for path in (self.log, self.script_copy, self.script_path, self.argv):
            path.unlink(missing_ok=True)

    def run_ps(self, script, extra_env=None):
        path = self.root / "invoke.ps1"
        path.write_text("$ErrorActionPreference='Stop'\n" + script, encoding="utf-8")
        return subprocess.run([POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(path)],
                              env={**self.env, **(extra_env or {})}, cwd=self.root,
                              capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30)

    def invocation(self, entry="Deploy", extra="", pin=None, plink=None, key=None):
        name = "Deploy-NcpPreview.ps1" if entry == "Deploy" else "Operator-NcpPreview.ps1"
        operation = "" if entry == "Deploy" else f" -Operation {entry} -OwnerApproved"
        return (f"& {literal(self.scripts / name)} -Apply{operation} -ServerIPv4 '1.1.1.1' "
                f"-PrivateKeyPath {literal(key or self.key)} "
                f"-HostKeyFingerprint {literal(pin or 'ssh-ed25519 255 SHA256:' + DIGEST)} "
                f"-PlinkExe {literal(plink or self.plink)} -WinSCPExe {literal(self.winscp)} {extra}\n")

    def test_exact_digest_formats_and_ed25519_display_sizes(self):
        script = f". {literal(self.scripts / 'NcpPreview.Common.ps1')}\n"
        script += "@(\n" + "\n".join(
            f"(Convert-NcpHostKeyPin {literal(f'{algorithm} {bits} SHA256:{DIGEST}{padding}')})"
            for algorithm, bits, padding in (("ssh-ed25519", 255, ""), ("ssh-ed25519", 256, "="),
                                             ("ssh-rsa", 2048, ""), ("ecdsa-sha2-nistp256", 256, "")))
        script += "\n) | ConvertTo-Json -Compress\n"
        run = self.run_ps(script)
        self.assertEqual(run.returncode, 0, run.stderr)
        results = json.loads(run.stdout)
        self.assertEqual([x["Plink"] for x in results], ["SHA256:" + DIGEST] * 4)
        self.assertEqual([x["WinSCP"] for x in results],
                         [f"{kind} {bits} {DIGEST}=" for kind, bits in
                          (("ssh-ed25519", 255), ("ssh-ed25519", 255), ("ssh-rsa", 2048), ("ecdsa-sha2-nistp256", 256))])

    def test_invalid_fingerprints_fail_before_packaging_or_native_process(self):
        for pin in ("*", "acceptnew", "ssh-ed25519 255 SHA256:" + "A" * 20,
                    "ssh-ed25519 255 SHA256:" + DIGEST + ";*",
                    "ssh-ed25519 255 SHA256:" + "A" * 42 + "B",
                    "ssh-ed25519 123 SHA256:" + DIGEST):
            with self.subTest(pin=pin):
                run = self.run_ps(self.invocation(pin=pin))
                self.assertNotEqual(run.returncode, 0)
                self.assertFalse(self.log.exists())

    def test_upload_uses_script_file_preserves_spaces_and_removes_it(self):
        run = self.run_ps(self.invocation())
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(self.log.read_text().splitlines(), ["upload", "ssh"])
        script = self.script_copy.read_text(encoding="utf-8-sig")
        self.assertIn(f'-privatekey="{self.key}"', script)
        self.assertIn("option batch abort", script)
        self.assertFalse(Path(self.script_path.read_text()).exists())
        self.assertIn(f"SHA256:{DIGEST}", self.argv.read_text())
        run = self.run_ps(self.invocation(), {"NCP_TEST_FAIL_UPLOAD": "1"})
        self.assertNotEqual(run.returncode, 0)
        self.assertEqual(self.log.read_text().splitlines(), ["upload", "ssh", "upload"])
        script_arg = next(x for x in self.argv.read_text().splitlines() if x.startswith("/script="))
        self.assertFalse(Path(script_arg[len("/script="):]).exists())

    def test_mismatched_digest_aborts_upload_and_never_runs_remote_apply(self):
        wrong = base64.b64encode(bytes(reversed(range(32)))).decode().rstrip("=")
        run = self.run_ps(self.invocation(pin="ssh-ed25519 255 SHA256:" + wrong))
        self.assertNotEqual(run.returncode, 0)
        self.assertEqual(self.log.read_text().splitlines(), ["upload"])
        self.assertFalse(Path(self.script_path.read_text()).exists())

    def test_relative_executable_rejected_despite_powershell_dotnet_directory_difference(self):
        for entry in ("Deploy", "Verify", "Rollback"):
            prefix = f"Set-Location {literal(self.tools)}\n[Environment]::CurrentDirectory = {literal(self.root)}\n"
            run = self.run_ps(prefix + self.invocation(entry=entry, plink="plink.exe"))
            self.assertNotEqual(run.returncode, 0, entry)
            self.assertFalse(self.log.exists())

    def test_relative_private_key_uses_powershell_location_once(self):
        # Windows TEMP can use RUNNER~1 while Resolve-Path expands runneradmin.
        # Compare file identity, and ensure the different .NET cwd's same-name
        # decoy cannot be selected through GetFullPath's old resolution bug.
        decoy = self.tools / self.key.name
        decoy.write_text("foreign synthetic key placeholder\n")
        prefix = f"Set-Location {literal(self.key.parent)}\n[Environment]::CurrentDirectory = {literal(self.tools)}\n"
        try:
            run = self.run_ps(prefix + self.invocation(entry="Verify", key=self.key.name))
            self.assertEqual(run.returncode, 0, run.stderr)
            argv = self.argv.read_text().splitlines()
            actual = Path(argv[argv.index("-i") + 1])
            self.assertTrue(actual.is_absolute())
            self.assertTrue(actual.samefile(self.key))
            self.assertFalse(actual.samefile(decoy))
        finally:
            decoy.unlink()

    def test_public_ipv4_policy_and_rollback_argument_rejection(self):
        script = f". {literal(self.scripts / 'NcpPreview.Common.ps1')}\n"
        for ip in ("1.1.1.1", "8.8.8.8", "93.184.216.34", "192.0.0.9", "192.0.0.10"):
            script += f"Assert-NcpPublicIPv4 {literal(ip)}\n"
        for ip in ("0.1.1.1", "10.0.0.1", "127.0.0.1", "100.64.0.1", "169.254.1.1", "172.16.0.1",
                   "192.168.1.1", "192.0.0.8", "192.0.0.170", "192.0.2.1", "198.18.0.1", "198.19.255.255",
                   "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255", "01.1.1.1"):
            script += f"$rejected=$false; try {{ Assert-NcpPublicIPv4 {literal(ip)} }} catch {{ $rejected=$true }}; if (-not $rejected) {{ throw 'IP accepted' }}\n"
        run = self.run_ps(script)
        self.assertEqual(run.returncode, 0, run.stderr)
        for operation in ("Plan", "Deploy", "Verify"):
            run = self.run_ps(f"& {literal(self.scripts / 'Operator-NcpPreview.ps1')} -Operation {operation} -Target {literal('a'*64)}\n")
            self.assertNotEqual(run.returncode, 0)
            self.assertFalse(self.log.exists())

    def test_key_expansion_path_is_rejected_before_native_execution(self):
        key = self.root / "%NCP_TEST_DIGEST%.ppk"
        key.write_text("synthetic placeholder\n")
        run = self.run_ps(self.invocation(key=key))
        self.assertNotEqual(run.returncode, 0)
        self.assertFalse(self.log.exists())


if __name__ == "__main__":
    unittest.main()
