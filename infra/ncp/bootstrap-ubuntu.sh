#!/usr/bin/env bash
# HUFS One AI: Ubuntu server preparation for SSH-only SYNTHETIC PREVIEW.
# This script does not provision NCP, open web ports, deploy production, or call paid APIs.
set -Eeuo pipefail
umask 077

usage() {
  echo "Usage: sudo bash bootstrap-ubuntu.sh --admin-public-key /root/hufs-admin.pub --admin-ip 1.2.3.4/32 --ack-acg-ready" >&2
  exit 2
}
[[ $(id -u) -eq 0 ]] || { echo "Run with sudo/root." >&2; exit 2; }
[[ -r /etc/os-release ]] || { echo "Missing OS identification." >&2; exit 2; }
# shellcheck source=/etc/os-release
. /etc/os-release
[[ "$ID" == ubuntu && ( "$VERSION_ID" == 22.04 || "$VERSION_ID" == 24.04 ) ]] || {
  echo "Only Ubuntu Server 22.04/24.04 LTS are supported." >&2; exit 2;
}
[[ $(dpkg --print-architecture) == amd64 ]] || { echo "Expected amd64/x86_64 image." >&2; exit 2; }

PUBLIC_KEY=''
ADMIN_IP=''
ACK=no
while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin-public-key) [[ $# -gt 1 ]] || usage; PUBLIC_KEY="$2"; shift 2;;
    --admin-ip) [[ $# -gt 1 ]] || usage; ADMIN_IP="$2"; shift 2;;
    --ack-acg-ready) ACK=yes; shift;;
    *) usage;;
  esac
done
[[ "$ACK" == yes && -f "$PUBLIC_KEY" && -r "$PUBLIC_KEY" ]] || usage
[[ ! -L "$PUBLIC_KEY" ]] || { echo "Refusing symlink public key." >&2; exit 2; }
[[ $(wc -l < "$PUBLIC_KEY") -eq 1 ]] || { echo "Exactly one public key required." >&2; exit 2; }
grep -Eq '^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+( |$)' "$PUBLIC_KEY" || {
  echo "Supply OpenSSH PUBLIC key, never NCP .pem or PuTTY private .ppk." >&2; exit 2;
}
python3 - "$ADMIN_IP" <<'PY'
import ipaddress, sys
try:
    network=ipaddress.ip_network(sys.argv[1], strict=True)
    assert network.version==4 and network.prefixlen==32 and network.is_global
except Exception:
    sys.exit("SSH admin CIDR must be a single PUBLIC IPv4 /32, not an open range.")
PY

echo "This changes Ubuntu packages, creates hufs-admin/hufs-preview, and restricts SSH to $ADMIN_IP."
echo "Verify this exact IP is allowed by the NCP ACG and subnet Network ACL BEFORE continuing."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg python3 unzip ufw openssh-server sudo
# NodeSource signed APT repository, not curl|bash. Node 24 is required by Vite 8.
install -d -m 0755 /usr/share/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --batch --yes --dearmor -o /usr/share/keyrings/nodesource.gpg
chmod 0644 /usr/share/keyrings/nodesource.gpg
cat > /etc/apt/sources.list.d/hufs-nodesource.sources <<'EOF'
Types: deb
URIs: https://deb.nodesource.com/node_24.x
Suites: nodistro
Components: main
Architectures: amd64
Signed-By: /usr/share/keyrings/nodesource.gpg
EOF
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nodejs
[[ $(node -p 'process.versions.node.split(".")[0]') -eq 24 ]] || { echo "Node 24 installation failed." >&2; exit 1; }

if ! id -u hufs-admin >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash hufs-admin
fi
if ! id -u hufs-preview >/dev/null 2>&1; then
  useradd --create-home --shell /usr/sbin/nologin hufs-preview
fi
install -d -m 0700 -o hufs-admin -g hufs-admin /home/hufs-admin/.ssh
install -m 0600 -o hufs-admin -g hufs-admin "$PUBLIC_KEY" /home/hufs-admin/.ssh/authorized_keys
install -d -m 0750 -o hufs-preview -g hufs-preview /opt/hufs-one/preview
install -d -m 0750 -o hufs-preview -g hufs-preview /opt/hufs-one/preview/releases

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
install -m 0755 "$SCRIPT_DIR/deploy-preview.sh" /usr/local/sbin/hufs-preview-deploy
install -m 0755 "$SCRIPT_DIR/harden-ssh.sh" /usr/local/sbin/hufs-ssh-harden
install -m 0644 "$SCRIPT_DIR/hufs-preview.service" /etc/systemd/system/hufs-preview.service
cat > /etc/sudoers.d/hufs-ncp-preview <<'EOF'
hufs-admin ALL=(root) NOPASSWD: /usr/local/sbin/hufs-preview-deploy, /usr/local/sbin/hufs-ssh-harden
EOF
chmod 0440 /etc/sudoers.d/hufs-ncp-preview
visudo -cf /etc/sudoers.d/hufs-ncp-preview
systemctl daemon-reload

ufw default deny incoming
ufw default allow outgoing
ufw allow from "$ADMIN_IP" to any port 22 proto tcp comment 'HUFS SSH restricted admin'
ufw --force enable
ufw status verbose
echo ""
echo "PREVIEW HOST PREPARED. Do not expose TCP 5173/3000/5432/6379 or start production."
echo "From a SECOND PuTTY window, confirm OpenSSH key login as hufs-admin first."
echo "Then run: sudo /usr/local/sbin/hufs-ssh-harden --i-tested-new-key-login"
echo "Copy the allowlisted ZIP to /home/hufs-admin/ncp-preview.zip using WinSCP SFTP."
echo "Run: sudo /usr/local/sbin/hufs-preview-deploy <SHA256_FROM_WINDOWS>"
