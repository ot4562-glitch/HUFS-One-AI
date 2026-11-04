#!/usr/bin/env bash
# Approved NCP Ubuntu 22.04/24.04 host installer; no download/VM creation.
# Plan prints no secrets, reads no host state and changes no file.
set -Eeuo pipefail
umask 077
apply=no
ack=no
acg=no
key=''
admin=''
expected=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan) [[ "$#" -eq 1 ]] || exit 2
      echo 'PLAN ONLY: verify root-owned reviewed bootstrap bundle, approved public SSH key, administrator IPv4/32 and NCP ACG/NACL, then install Ubuntu/node and localhost-only preview.'
      echo 'Second independently verified hufs-admin key login is required BEFORE hardening SSH.'
      echo 'No NCP resource, network, package or file was touched. RELEASE_BLOCKED.'
      exit 0;;
    --apply) apply=yes;shift;;
    --ack-owner-approved) ack=yes;shift;;
    --ack-acg-verified) acg=yes;shift;;
    --admin-public-key) [[ $# -gt 1 ]] || exit 2;key=$2;shift 2;;
    --admin-ip) [[ $# -gt 1 ]] || exit 2;admin=$2;shift 2;;
    --reviewed-bootstrap-sha256) [[ $# -gt 1 ]] || exit 2;expected=$2;shift 2;;
    *) echo 'Unknown installer option.' >&2;exit 2;;
  esac
done
if [[ "$apply" != yes ]];then
  echo 'Use --plan without other options; explicit --apply plus acknowledgements required.' >&2
  exit 2
fi
[[ "$ack" == yes && "$acg" == yes && $(id -u) -eq 0 ]] || {
  echo 'Owner-approved root invocation and ACG verification required.' >&2;exit 2;
}
[[ "$expected" =~ ^[a-f0-9]{64}$ && ! "$expected" =~ ^0{64}$ ]] || {
  echo 'Exact reviewed bootstrap SHA256 required.' >&2;exit 2;
}
[[ "$key" == /root/* && ! -L "$key" && -f "$key" && -r "$key" ]] || {
  echo 'Supply a single local root-owned PUBLIC SSH key path under /root/.' >&2;exit 2;
}
[[ $(stat -c '%u' "$key") == 0 && $(stat -c '%a' "$key") =~ ^[0-7]+$ ]] || exit 2
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
bootstrap="$script_dir/bootstrap-ubuntu.sh"
# The bootstrap installs these companions as privileged sudo helpers. Its hash
# alone cannot establish their trust: protect every fixed input and every parent
# against replacement by an unprivileged account before invoking the bootstrap.
python3 - "$script_dir" <<'PY'
import pathlib, stat, sys
bundle = pathlib.Path(sys.argv[1])
expected_uid = 0
trusted_root = pathlib.Path('/')
def trusted(path, directory):
    info = path.lstat()
    kind = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if not kind or path.resolve() != path or info.st_uid != expected_uid or info.st_mode & 0o022:
        sys.exit('Untrusted bootstrap bundle: require canonical root-owned non-writable files and parents.')
try:
    if not bundle.is_absolute() or not bundle.is_relative_to(trusted_root):
        sys.exit('Invalid bootstrap bundle boundary.')
    parent = bundle
    while True:
        trusted(parent, True)
        if parent == trusted_root:
            break
        parent = parent.parent
    trusted(bundle / 'setup', True)
    for relative in ['bootstrap-ubuntu.sh', 'deploy-preview.sh', 'harden-ssh.sh',
                     'rollback-preview.sh', 'hufs-preview.service', 'setup/02-install-host.sh']:
        trusted(bundle / relative, False)
except OSError:
    sys.exit('Missing or inaccessible trusted bootstrap bundle input.')
PY
actual=$(sha256sum "$bootstrap")
actual=${actual%% *}
[[ "$actual" == "$expected" ]] || {
  echo 'Bootstrap bytes do not match the independently reviewed release.' >&2;exit 2;
}
python3 - "$admin" <<'PY'
import ipaddress,sys
try:
    addr=ipaddress.ip_network(sys.argv[1],strict=True)
    assert addr.version==4 and addr.prefixlen==32 and addr.network_address.is_global
except Exception:
    sys.exit('Admin SSH source must be a real public IPv4 /32.')
PY
# This is the ONLY mutation. The existing bootstrap checks OS/AMD64,
# copies fixed helpers, provisions Node, configures key auth and UFW.
# It never disables root/password SSH: the independent 2nd SSH login
# and harden-ssh.sh remain explicit human operations.
exec bash "$bootstrap" --admin-public-key "$key" --admin-ip "$admin" --ack-acg-ready
