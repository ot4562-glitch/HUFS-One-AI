#!/usr/bin/env bash
# HUFS One AI: deploy an explicitly allowlisted synthetic Vite demo on SSH loopback ONLY.
# Never clone the private repository to NCP, publish port 5173, or enable production services.
set -Eeuo pipefail
umask 077
if [[ $(id -u) -ne 0 || "$#" -ne 1 || ! "$1" =~ ^[a-fA-F0-9]{64}$ ]]; then
  echo "Usage: sudo /usr/local/sbin/hufs-preview-deploy <64-hex SHA256 of Windows ZIP>" >&2
  exit 2
fi
[[ "$SUDO_USER" == 'hufs-admin' ]] || {
  echo "Deploy must be launched by hufs-admin via limited sudo." >&2; exit 2;
}
command -v node >/dev/null && command -v npm >/dev/null || { echo "Run bootstrap first." >&2; exit 1; }
[[ $(node -p 'process.versions.node.split(".")[0]') -eq 24 ]] || { echo "Node 24 required." >&2; exit 1; }

archive=/home/hufs-admin/ncp-preview.zip
[[ -f "$archive" && ! -L "$archive" ]] || { echo "Expected WinSCP ZIP at $archive (not a link)." >&2; exit 1; }
[[ $(stat -c '%U' "$archive") == 'hufs-admin' ]] || { echo "The ZIP must belong to hufs-admin." >&2; exit 1; }
[[ $(stat -c '%s' "$archive") -le 33554432 ]] || { echo "ZIP size limit exceeded." >&2; exit 1; }
# The SFTP owner can mutate the upload. Freeze bytes in a root-only temp file
# BEFORE digest verification, ZIP inspection and extraction (TOCTOU defense).
sealed=$(mktemp /tmp/hufs-preview-reviewed.XXXXXXXX.zip)
trap 'rm -f -- "$sealed"' EXIT
install -m 0600 -- "$archive" "$sealed"
expected=$(echo "$1" | tr 'A-F' 'a-f')
actual=$(sha256sum "$sealed")
actual=$(echo "$actual" | cut -d ' ' -f 1)
[[ "$actual" == "$expected" ]] || { echo "ZIP SHA256 MISMATCH. Refusing deploy." >&2; exit 1; }

# Do not unzip until every entry has passed allowlist, traversal, symlink and size checks.
python3 - "$sealed" <<'PY'
import pathlib, stat, sys, zipfile
p=pathlib.Path(sys.argv[1])
if p.stat().st_size>32*1024*1024:
    sys.exit("ZIP exceeds 32 MiB. Refusing.")
fixed={
  "package.json", "package-lock.json", "tsconfig.json",
  "apps/web/index.html", "apps/web/vite.config.ts",
  "packages/contracts/package.json", "packages/contracts/tsconfig.build.json",
  "infra/ncp/bootstrap-ubuntu.sh", "infra/ncp/harden-ssh.sh",
  "infra/ncp/deploy-preview.sh", "infra/ncp/hufs-preview.service",
  "infra/ncp/rollback-preview.sh",
}
prefixes=(
  "apps/web/src/", "packages/contracts/src/", "packages/core/src/",
  "packages/ui/src/", "packages/fixtures/synthetic/",
)
with zipfile.ZipFile(p) as z:
    entries=z.infolist()
    if len(entries)>1200 or sum(i.file_size for i in entries)>150*1024*1024:
        sys.exit("ZIP content too large.")
    names={i.filename for i in entries}
    if len(names)!=len(entries):
        sys.exit("Duplicate ZIP member names forbidden.")
    for needed in ("package-lock.json","apps/web/src/main.tsx","infra/ncp/deploy-preview.sh"):
        if needed not in names:
            sys.exit("Missing required allowlisted file: "+needed)
    for i in entries:
        n=i.filename
        q=pathlib.PurePosixPath(n)
        if not n or n.startswith("/") or "\\" in n or ".." in q.parts or ":" in n or "\x00" in n:
            sys.exit("Unsafe ZIP member path")
        if stat.S_IFMT(i.external_attr>>16)==stat.S_IFLNK:
            sys.exit("Symbolic links are forbidden in preview bundle.")
        # Zip writers may add parent directories.
        parent=(n.endswith("/") and any(f.startswith(n) for f in fixed)
                or n.endswith("/") and any(d.startswith(n) for d in prefixes))
        if n not in fixed and not any(n.startswith(d) for d in prefixes) and not parent:
            sys.exit("Unreviewed bundle member: "+n)
        if any(part.startswith(".env") for part in q.parts):
            sys.exit("Environment secrets forbidden.")
        if q.suffix.lower() in (".csv",".pem",".ppk",".key",".p12",".pfx",".sqlite",".db"):
            sys.exit("Sensitive file extension forbidden.")
print("Allowlisted ZIP paths, size and symlink policy: PASS")
PY

base=/opt/hufs-one/preview
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
release="$base/releases/$expected"
old=''
if [[ -L "$base/current" ]]; then old=$(readlink "$base/current"); fi
if [[ ! -d "$release" ]]; then
  mkdir -p "$release"
  unzip -q "$sealed" -d "$release"
  chown -R hufs-preview:hufs-preview "$release"
fi
cd "$release"
# Run all package code unprivileged. Lifecycle/postinstall hooks are forbidden.
runuser -u hufs-preview -- env HOME=/home/hufs-preview npm ci --ignore-scripts --no-audit --no-fund
runuser -u hufs-preview -- env HOME=/home/hufs-preview npm run build:contracts
runuser -u hufs-preview -- env HOME=/home/hufs-preview npm run build:web
# This production Vite asset build is NOT a deployable authenticated API.
# The systemd preview runs ONLY localhost, synthetic DEV mode and no paid providers.
newlink="$base/.current-new"
rm -f "$newlink"
ln -s "$release" "$newlink"
mv -Tf "$newlink" "$base/current"
rollback_preview() {
  local rollback_failed=no
  echo "Activation failed. Rolling back the preview symlink." >&2
  if [[ -n "$old" ]]; then
    if rm -f "$newlink" && ln -s "$old" "$newlink" && mv -Tf "$newlink" "$base/current"; then
      systemctl restart hufs-preview.service || rollback_failed=yes
    else
      rollback_failed=yes
    fi
  else
    systemctl stop hufs-preview.service || rollback_failed=yes
    rm -f "$base/current" || rollback_failed=yes
  fi
  if [[ "$rollback_failed" == yes ]]; then
    echo "Rollback incomplete; manual recovery required. Do not declare this preview healthy." >&2
  fi
  journalctl -u hufs-preview.service --no-pager -n 20 >&2 || true
}
# set -e alone would exit after a failed enable/restart with the NEW pointer
# still active. Route activation failures through the same recovery as health.
if ! systemctl enable hufs-preview.service >/dev/null || ! systemctl restart hufs-preview.service; then
  rollback_preview
  exit 1
fi
ok=no
for _ in $(seq 1 20); do
  if curl -fsS --connect-timeout 1 --max-time 3 http://127.0.0.1:5173/ >/dev/null \
    && curl -fsS --connect-timeout 1 --max-time 3 http://127.0.0.1:5173/src/main.tsx >/dev/null; then
    ok=yes
    break
  fi
  sleep 2
done
if [[ "$ok" != yes ]]; then
  rollback_preview
  exit 1
fi
echo "OK: SYNTHETIC PREVIEW listens ONLY on 127.0.0.1:5173."
echo "Windows PuTTY tunnel: Source port 5174 -> Destination 127.0.0.1:5173, then browse http://127.0.0.1:5174"
echo "NO public domain, production OIDC, real data, NCP OCR, Laya or paid AI was enabled."
