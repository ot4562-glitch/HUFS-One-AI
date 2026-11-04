#!/usr/bin/env bash
# Restore only an operator-reviewed, already-present SYNTHETIC SSH preview.
set -Eeuo pipefail
umask 077
target='' expected='' apply=no approved=no
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) [[ $# -gt 1 ]] || exit 2; target=$2; shift 2;;
    --expected-current) [[ $# -gt 1 ]] || exit 2; expected=$2; shift 2;;
    --apply) apply=yes; shift;;
    --ack-owner-approved) approved=yes; shift;;
    *) echo 'Unknown rollback option.' >&2; exit 2;;
  esac
done
[[ "$target" =~ ^[a-f0-9]{64}$ && "$expected" =~ ^[a-f0-9]{64}$ && "$target" != "$expected" ]] || {
  echo 'Usage: rollback-preview.sh --target <existing archive SHA256> --expected-current <current archive SHA256> [--apply --ack-owner-approved]' >&2
  exit 2
}
if [[ "$apply" != yes ]]; then
  echo 'PLAN ONLY: verify existing synthetic target, lock preview operations, compare current, switch, restart and check loopback health; restore original on failure.'
  echo 'No host inspected or modified. Folder IDs do not prove content integrity; operator review and explicit host approval are required.'
  exit 0
fi
[[ "$approved" == yes && $(id -u) -eq 0 && "${SUDO_USER:-}" == hufs-admin ]] || {
  echo 'Explicit owner-approved hufs-admin limited sudo required.' >&2; exit 2;
}
base=/opt/hufs-one/preview
# Fixed, root-owned parent and a no-link lock; deploy-preview uses the SAME lock.
[[ -d "$base" && ! -L "$base" && ! -L "$base/.preview-operation.lock" ]] || exit 2
[[ ! -e "$base/.preview-operation.lock" || -f "$base/.preview-operation.lock" ]] || exit 2
python3 - "$base" <<'PY'
import pathlib,stat,sys
base=pathlib.Path(sys.argv[1]); expected_uid = 0
for path in [base,base/'releases']:
    info=path.lstat()
    if not stat.S_ISDIR(info.st_mode) or path.resolve()!=path or info.st_uid!=expected_uid or info.st_mode&0o022:
        sys.exit('Untrusted preview lock parent')
lock=base/'.preview-operation.lock'
if lock.exists():
    info=lock.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=expected_uid or info.st_mode&0o022:
        sys.exit('Untrusted preview lock')
PY
exec 9>>"$base/.preview-operation.lock"
flock -n 9 || { echo 'Another preview operation is active.' >&2; exit 2; }
python3 - "$base" "$target" "$expected" <<'PY'
import pathlib, stat, sys
base=pathlib.Path(sys.argv[1]); target=sys.argv[2]; expected=sys.argv[3]
expected_uid = 0
for parent in [base,base/'releases']:
    info=parent.lstat()
    if not stat.S_ISDIR(info.st_mode) or parent.resolve()!=parent or info.st_uid!=expected_uid or info.st_mode&0o022:
        sys.exit('Untrusted preview parent boundary')
for name in [target,expected]:
    folder=base/'releases'/name
    if folder.is_symlink() or not folder.is_dir() or folder.resolve()!=folder:
        sys.exit('Release must be a direct existing release directory')
    for part in ['package-lock.json','apps/web/src/main.tsx','apps/web/vite.config.ts','node_modules/vite/bin/vite.js']:
        file=folder/part
        if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(folder):
            sys.exit('Missing or escaping preview prerequisite')
current=base/'current'
if not current.is_symlink() or current.resolve()!=base/'releases'/expected:
    sys.exit('Current preview changed; re-plan before restoring')
PY
newlink="$base/.rollback-next-$$"
[[ ! -e "$newlink" && ! -L "$newlink" ]] || exit 2
trap 'rm -f -- "$newlink"' EXIT
switch_to() {
  ln -s "$base/releases/$1" "$newlink" && mv -Tf -- "$newlink" "$base/current"
}
restart_preview() { timeout 15s systemctl restart hufs-preview.service; }
healthy() {
  curl -fsS --connect-timeout 1 --max-time 3 http://127.0.0.1:5173/ >/dev/null \
    && curl -fsS --connect-timeout 1 --max-time 3 http://127.0.0.1:5173/src/main.tsx >/dev/null
}
switch_to "$target"
if restart_preview && healthy; then
  echo 'OK: selected existing SYNTHETIC preview restored and loopback health passed.'
  exit 0
fi
echo 'Requested restore failed; restoring the original preview.' >&2
if [[ $(readlink "$base/current") == "$base/releases/$target" ]] \
  && switch_to "$expected" && restart_preview && healthy; then
  echo 'Original preview restored; requested rollback did not succeed.' >&2
  exit 1
fi
echo 'Rollback incomplete; manual recovery required. Do not declare healthy.' >&2
journalctl -u hufs-preview.service --no-pager -n 20 >&2 || true
exit 3
