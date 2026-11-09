"""#362: LOCAL-REF metadata-only historical CSV exposure inventory.

Never reads/prints CSV contents, names, object hashes, student IDs or Git commit
messages. Does not fetch refs, inspect remote forks, rewrite, remove or stage data.
Run only in a trusted, complete local clone; NOT a legal/data-rights clearance.
"""
from __future__ import annotations

import json
import os
import sys
import subprocess
from pathlib import Path
from typing import Callable

LIMIT = 20000


class AuditUnavailable(Exception):
    """An incomplete history cannot be reported as clean."""


def parse_tree_metadata(raw: bytes) -> list[str]:
    """Only return object IDs in memory; no original path is ever returned."""
    objects: list[str] = []
    for line in raw.split(b"\x00"):
        if not line:
            continue
        descriptor, sep, path = line.partition(b"\t")
        parts = descriptor.split(b" ")
        if not sep or len(parts) != 3 or parts[0] != b"100644" or parts[1] != b"blob":
            raise AuditUnavailable("TREE_METADATA_UNAVAILABLE")
        # Retain only the prefix in memory; the filename never reaches a report.
        if not path.startswith(b"csv/"):
            raise AuditUnavailable("TREE_SCOPE_UNAVAILABLE")
        sha = parts[2]
        if len(sha) not in (40, 64) or any(b not in b"0123456789abcdef" for b in sha):
            raise AuditUnavailable("TREE_OBJECT_UNAVAILABLE")
        objects.append(sha.decode("ascii"))
    return objects


def inspect_history(run: Callable[[tuple[str, ...]], bytes]) -> dict[str, object]:
    """run must be a *local, read-only Git metadata* adapter."""
    if run(("rev-parse", "--is-shallow-repository")).strip() != b"false":
        raise AuditUnavailable("SHALLOW_HISTORY_NOT_ACCEPTED")
    revisions = run(("rev-list", "--all")).splitlines()
    if not revisions or len(revisions) > LIMIT:
        raise AuditUnavailable("UNBOUNDED_OR_EMPTY_HISTORY")
    objects: set[str] = set()
    affected_commits = 0
    max_entries = 0
    for commit in revisions:
        if len(commit) not in (40, 64) or any(b not in b"0123456789abcdef" for b in commit):
            raise AuditUnavailable("COMMIT_METADATA_UNAVAILABLE")
        # ls-tree reads tree/index metadata, NOT blob bodies.
        found = parse_tree_metadata(run(("ls-tree", "-r", "-z", commit.decode("ascii"), "--", "csv/")))
        if found:
            affected_commits += 1
            max_entries = max(max_entries, len(found))
            objects.update(found)
    return {
        "scope": "FETCHED_LOCAL_GIT_REFS_ONLY",
        "path_coverage": "CSV_DIRECTORY_ONLY",
        "csv_outside_directory_or_historical_moves": "UNKNOWN",
        "state": "HISTORICAL_CSV_METADATA_OBSERVED" if affected_commits else "NO_CSV_IN_FETCHED_LOCAL_REFS",
        "commits_scanned": len(revisions),
        "commits_containing_csv": affected_commits,
        "distinct_csv_blob_versions": len(objects),
        "max_csv_files_in_one_commit": max_entries,
        "csv_contents_read": False,
        "file_names_reported": False,
        "external_forks_and_unfetched_refs": "UNKNOWN",
        "owner_publication_rights_and_consent": "NOT_VERIFIED",
        "history_rewritten": False,
    }


def local_git(root: Path, args: tuple[str, ...]) -> bytes:
    env = {**os.environ, "GIT_NO_LAZY_FETCH": "1", "GIT_TERMINAL_PROMPT": "0"}
    process = subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, env=env, timeout=60,
        check=False,
    )
    if process.returncode != 0:
        # stderr may contain filenames/identifiers: intentionally discard.
        raise AuditUnavailable("LOCAL_GIT_METADATA_UNAVAILABLE")
    return process.stdout


def main() -> int:
    # No command arguments are accepted: don't risk printing a user-provided path.
    if len(sys.argv) != 1:
        print(json.dumps({"state": "AUDIT_UNAVAILABLE", "reason": "NO_ARGUMENTS_ACCEPTED"}))
        return 2
    root = Path(__file__).resolve().parents[2]
    try:
        report = inspect_history(lambda args: local_git(root, args))
    except (AuditUnavailable, OSError, subprocess.TimeoutExpired):
        print(json.dumps({"state": "AUDIT_UNAVAILABLE", "scope": "LOCAL_METADATA_ONLY"}))
        return 2
    print(json.dumps(report, sort_keys=True))
    # Exit 0 only means inventory succeeded; rights/consent remains unverified.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
