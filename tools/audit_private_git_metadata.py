"""#46 operator-local, metadata-only Git history evidence; never opens originals.

No network, changes, consent inference, raw path/author/subject output or history
rewriting. Run locally with `py tools/audit_private_git_metadata.py`; review the
hashed receipts against separately verified purpose-consent records.
"""
from __future__ import annotations
import hashlib
import json
import subprocess
from pathlib import Path


def _git(repo: Path, *args: str) -> bytes:
    try:
        result = subprocess.run(['git', '-C', str(repo), *args],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                check=False, timeout=30)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError('Git metadata unavailable') from None
    if result.returncode:
        raise RuntimeError('Git metadata unavailable')
    return result.stdout


def _protected(name: str) -> bool:
    parts = name.replace('\\', '/').lower().split('/')
    return any(p in {'csv', 'private', 'local_only', 'real5', 'student_records',
                     'secrets', 'credentials', 'backups', 'exports'} for p in parts)


def audit(repo: Path) -> dict:
    repo = repo.resolve()
    if _git(repo, 'rev-parse', '--is-inside-work-tree').strip() != b'true':
        raise RuntimeError('Git metadata unavailable')
    # Limit this audit to the explicitly selected checkout, never its parent.
    top = _git(repo, 'rev-parse', '--show-toplevel').decode('utf-8', 'surrogateescape').strip()
    if Path(top).resolve() != repo:
        raise RuntimeError('Git metadata unavailable')
    paths = [p for p in _git(repo, 'ls-files', '-z').split(b'\0') if p]
    protected = [p for p in paths if _protected(p.decode('utf-8', 'surrogateescape'))]
    if len(protected) > 100:
        raise RuntimeError('Protected metadata exceeds bounded local review')
    records = []
    for raw in sorted(protected):
        path = raw.decode('utf-8', 'surrogateescape')
        # --format excludes commit subjects/authors, --name-* and patch flags
        # are deliberately absent. Git reads object metadata, not working files.
        additions = list(dict.fromkeys(_git(repo, 'log', '--all', '--reverse',
            '--no-renames', '--diff-filter=A', '--format=%H', '--', path).decode('ascii').split()))
        if len(additions) > 100 or any(len(c) not in (40, 64) or
            any(x not in '0123456789abcdef' for x in c) for c in additions):
            raise RuntimeError('Git metadata unavailable')
        records.append({'pathRef': hashlib.sha256(raw).hexdigest()[:16],
                        'additionCommits': additions,
                        'historyState': 'FOUND' if additions else 'UNRESOLVED'})
    return {'scope': 'LOCAL_GIT_METADATA_ONLY',
            'head': _git(repo, 'rev-parse', 'HEAD').decode('ascii').strip(),
            'shallowHistory': _git(repo, 'rev-parse', '--is-shallow-repository').strip() == b'true',
            'protectedTrackedCount': len(records), 'records': records,
            'consent': 'NOT_VERIFIED', 'collaboratorCloneHistory': 'NOT_VERIFIED',
            'releaseDecision': 'RELEASE_BLOCKED'}


if __name__ == '__main__':
    try:
        print(json.dumps(audit(Path(__file__).resolve().parent.parent), separators=(',', ':')))
    except RuntimeError:
        print(json.dumps({'error': 'METADATA_UNAVAILABLE', 'releaseDecision': 'RELEASE_BLOCKED'}))
        raise SystemExit(1)
