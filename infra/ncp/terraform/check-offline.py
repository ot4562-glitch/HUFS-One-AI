"""Validate NCP Terraform with a SHA-pinned, local-only provider mirror.

The archive must already have been fetched and SHA-256 checked by
provider-mirror.py. terraform init may not query the registry or GitHub;
schema validation and terraform test still run with the real provider schema
and mock-only resources. No cloud keys/apply are allowed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


PROVIDER_VERSION = "4.0.7"
PROVIDER_SHA256 = "edbaca618aa59b9e5d5b04db1c4aabc34d108015609268ea276ace34eefac285"
PROVIDER_RELATIVE_PATH = (
    Path("registry.terraform.io/navercloudplatform/ncloud")
    / f"terraform-provider-ncloud_{PROVIDER_VERSION}_linux_amd64.zip"
)


def verify_provider_mirror(mirror: Path, module: Path) -> Path:
    if mirror.is_symlink() or not mirror.is_dir():
        raise ValueError("Trusted, regular provider mirror directory required")
    archive = mirror / PROVIDER_RELATIVE_PATH
    if archive.is_symlink() or not archive.is_file():
        raise ValueError("Missing checked official ncloud provider archive")
    if not 1 <= archive.stat().st_size <= 25_000_000:
        raise ValueError("NCP provider archive size outside safe bounds")
    digest = hashlib.sha256()
    with archive.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != PROVIDER_SHA256:
        raise ValueError("NCP provider archive SHA-256 mismatch")
    lock = (module / ".terraform.lock.hcl").read_text(encoding="utf-8")
    if (
        f'version     = "{PROVIDER_VERSION}"' not in lock
        or f'"zh:{PROVIDER_SHA256}"' not in lock
    ):
        raise ValueError("NCP provider mirror not approved by module lockfile")
    return archive


def offline_cli_config(mirror: Path) -> str:
    # Include only the pinned local filesystem mirror; no direct method can
    # silently use the registry or request a provider signature.
    return (
        "disable_checkpoint = true\n"
        "provider_installation {\n"
        "  filesystem_mirror {\n"
        f"    path = {json.dumps(str(mirror))}\n"
        '    include = ["registry.terraform.io/navercloudplatform/ncloud"]\n'
        "  }\n"
        "}\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--terraform", required=True, type=Path)
    parser.add_argument("--module", choices=("network", "host"), default="network")
    parser.add_argument("--provider-mirror", required=True, type=Path)
    args = parser.parse_args()
    binary = args.terraform.resolve(strict=True)
    root = Path(__file__).resolve().parents[3]
    module = Path(__file__).resolve().parent / args.module
    provider_mirror = args.provider_mirror.resolve(strict=True)
    verify_provider_mirror(provider_mirror, module)
    # Avoid auto-loaded local approvals or an accidental real provider in tests.
    if list(module.glob("*.tfvars*")):
        raise ValueError("Keep operator input outside the module; offline tests refuse auto tfvars")
    tests = list((module / "tests").glob("*.tftest.hcl"))
    if not tests:
        raise ValueError("No mock tests")
    for test in tests:
        text = test.read_text(encoding="utf-8")
        if not re.search(r'(?m)^mock_provider "ncloud"\s*\{', text) or re.search(r'(?m)^\s*provider\s+"', text):
            raise ValueError("Only the mocked NCP provider is allowed in this checker")
    cache = root / "local_only" / "ncp-iac-validation" / (args.module + "-data")
    cache.mkdir(parents=True, exist_ok=True)
    config = cache.parent / "empty.tfrc"
    config.write_text(offline_cli_config(provider_mirror), encoding="utf-8")
    env = {key: value for key, value in os.environ.items()
           if not key.upper().startswith(("NCLOUD_", "NCP_", "TF_", "TFC_"))}
    env.update(TF_DATA_DIR=str(cache), TF_CLI_CONFIG_FILE=str(config),
               CHECKPOINT_DISABLE="1", TF_IN_AUTOMATION="1")
    commands = [
        ["fmt", "-check", "-recursive", "-diff"],
        ["init", "-backend=false", "-input=false", "-lockfile=readonly", "-no-color"],
        ["validate", "-no-color"],
        ["test", "-no-color"],
    ]
    for command in commands:
        result = subprocess.run([str(binary), *command], cwd=module, env=env,
                                capture_output=True, text=True, timeout=300, check=False)
        print(f"terraform {' '.join(command)}: {'PASS' if result.returncode == 0 else 'FAIL'}")
        if result.returncode:
            print("\n".join((result.stdout + result.stderr).splitlines()[-80:]))
            raise SystemExit(result.returncode)
        if command[0] == "test":
            print(result.stdout.strip())
    print("Local checked provider v4.0.7 used; no provider registry query.")
    print("NCP API/apply/destroy: NOT_RUN. RELEASE_BLOCKED.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(f"Offline Terraform verification refused: {type(exc).__name__}", file=sys.stderr)
        raise SystemExit(2)
