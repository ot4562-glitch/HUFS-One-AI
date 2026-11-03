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
expected=$(echo "$1" | tr 'A-F' 'a-f')
actual=$(sha256sum "$archive")
actual=$(echo "$actual" | cut -d ' ' -f 1)
[[ "$actual" == "$expected" ]] || { echo "ZIP SHA256 MISMATCH. Refusing deploy." >&2; exit 1; }

# Do not unzip until every entry has passed allowlist, traversal, symlink and size checks.
python3 - "$archive" <<'PY'
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
release="$base/releases/$expected"
old=''
if [[ -L "$base/current" ]]; then old=$(readlink "$base/current"); fi
if [[ ! -d "$release" ]]; then
  mkdir -p "$release"
  unzip -q "$archive" -d "$release"
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
systemctl enable hufs-preview.service >/dev/null
systemctl restart hufs-preview.service
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
  echo "Health check failed. Rolling back the preview symlink." >&2
  if [[ -n "$old" ]]; then
    ln -s "$old" "$newlink"
    mv -Tf "$newlink" "$base/current"
    systemctl restart hufs-preview.service
  else
    systemctl stop hufs-preview.service || true
    rm -f "$base/current"
  fi
  journalctl -u hufs-preview.service --no-pager -n 20 >&2 || true
  exit 1
fi
echo "OK: SYNTHETIC PREVIEW listens ONLY on 127.0.0.1:5173."
echo "Windows PuTTY tunnel: Source port 5173 -> Destination 127.0.0.1:5173, then browse http://127.0.0.1:5173"
echo "NO public domain, production OIDC, real data, NCP OCR, Laya or paid AI was enabled."
