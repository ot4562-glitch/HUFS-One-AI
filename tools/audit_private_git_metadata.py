"""#46 operator-local, metadata-only Git history evidence; never opens originals.

No network, changes, consent inference, raw path/author/subject output or history
rewriting. Run locally with `python3 tools/audit_private_git_metadata.py`; review
hashed receipts against separately verified purpose-consent records. Additions
are observations in available local refs, not proof of the first publication.
"""
from __future__ import annotations
import hashlib
import json
import os
import subprocess
from pathlib import Path

MAX_METADATA_BYTES = 32 * 1024 * 1024
HISTORY_ARGS = ('--all', '--root', '--full-history', '-m', '--no-renames',
                '--no-ext-diff', '--no-textconv')


def _git(repo: Path, *args: str) -> bytes:
    try:
        result = subprocess.run(
            ['git', '--no-pager', '--literal-pathspecs', '-C', str(repo), *args],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            check=False, timeout=30,
            env={**os.environ, 'GIT_NO_LAZY_FETCH': '1', 'GIT_ALLOW_PROTOCOL': '',
                 'GIT_OPTIONAL_LOCKS': '0', 'GIT_NO_REPLACE_OBJECTS': '1'})
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError('Git metadata unavailable') from None
    if result.returncode or len(result.stdout) > MAX_METADATA_BYTES:
        raise RuntimeError('Git metadata unavailable')
    return result.stdout


def _protected(name: str) -> bool:
    parts = name.replace('\\', '/').lower().split('/')
    return any(p in {'csv', 'private', 'local_only', 'real5', 'student_records',
                     'forms_raw', 'private_identity_map', 'secrets',
                     'credentials', 'backups', 'exports'} for p in parts)


def _protected_paths(metadata: bytes) -> set[bytes]:
    return {raw for raw in metadata.split(b'\0')
            if raw and _protected(raw.decode('utf-8', 'surrogateescape'))}


def audit(repo: Path) -> dict:
    repo = repo.resolve()
    if _git(repo, 'rev-parse', '--is-inside-work-tree').strip() != b'true':
        raise RuntimeError('Git metadata unavailable')
    # Limit this audit to the explicitly selected checkout, never its parent.
    top = _git(repo, 'rev-parse', '--show-toplevel').decode('utf-8', 'surrogateescape').rstrip('\n')
    if Path(top).resolve() != repo:
        raise RuntimeError('Git metadata unavailable')
    shallow = _git(repo, 'rev-parse', '--is-shallow-repository').strip()
    if shallow not in (b'true', b'false'):
        raise RuntimeError('Git metadata unavailable')
    is_shallow = shallow == b'true'
    tracked = _protected_paths(_git(repo, 'ls-files', '-z'))
    # NUL-delimited tree-diff names include removed paths and every local ref.
    # No patch, rename similarity, text conversion, external diff or blob read.
    historical = _protected_paths(_git(repo, 'log', *HISTORY_ARGS,
                                       '--format=', '--name-only', '-z', '--'))
    protected = tracked | historical
    if len(protected) > 100:
        raise RuntimeError('Protected metadata exceeds bounded local review')
    records = []
    for raw in sorted(protected):
        path = raw.decode('utf-8', 'surrogateescape')
        additions = list(dict.fromkeys(_git(repo, 'log', *HISTORY_ARGS, '--reverse',
            '--diff-filter=A', '--format=%H', '--', path).decode('ascii').split()))
        if len(additions) > 100 or any(len(c) not in (40, 64) or
            any(x not in '0123456789abcdef' for x in c) for c in additions):
            raise RuntimeError('Git metadata unavailable')
        records.append({'pathRef': hashlib.sha256(raw).hexdigest()[:16],
                        'currentlyTracked': raw in tracked,
                        'additionCommits': additions,
                        'historyState': ('SHALLOW_UNRESOLVED' if is_shallow else
                                         'FOUND' if additions else 'UNRESOLVED')})
    return {'scope': 'LOCAL_GIT_METADATA_ONLY',
            'head': _git(repo, 'rev-parse', 'HEAD').decode('ascii').strip(),
            'shallowHistory': is_shallow,
            'historyCoverage': ('SHALLOW_LOCAL_REFS' if is_shallow else
                                'AVAILABLE_LOCAL_REFS_ONLY'),
            'protectedTrackedCount': len(tracked),
            'protectedHistoricalCount': len(historical),
            'records': records,
            'unreachableHistory': 'NOT_VERIFIED',
            'consent': 'NOT_VERIFIED', 'collaboratorCloneHistory': 'NOT_VERIFIED',
            'releaseDecision': 'RELEASE_BLOCKED'}


if __name__ == '__main__':
    try:
        print(json.dumps(audit(Path(__file__).resolve().parent.parent), separators=(',', ':')))
    except RuntimeError:
        print(json.dumps({'error': 'METADATA_UNAVAILABLE', 'releaseDecision': 'RELEASE_BLOCKED'}))
        raise SystemExit(1)
