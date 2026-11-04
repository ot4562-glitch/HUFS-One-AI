"""Validate approved NCP module schemas using only mocked providers, never real apply.

init downloads the pinned public provider package. validate is schema-only; test
uses in-memory mock resources. No cloud keys are accepted or passed to children.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--terraform", required=True, type=Path)
    parser.add_argument("--module", choices=("network", "host"), default="network")
    args = parser.parse_args()
    binary = args.terraform.resolve(strict=True)
    root = Path(__file__).resolve().parents[3]
    module = Path(__file__).resolve().parent / args.module
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
    config.write_text("# No cloud, registry or credential helper configuration.\n", encoding="utf-8")
    env = {key: value for key, value in os.environ.items()
           if not key.upper().startswith(("NCLOUD_", "TF_", "TFC_"))}
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
    print("NCP API/apply/destroy: NOT_RUN. RELEASE_BLOCKED.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print(f"Offline Terraform verification refused: {type(exc).__name__}", file=sys.stderr)
        raise SystemExit(2)
