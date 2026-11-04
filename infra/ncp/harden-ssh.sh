#!/usr/bin/env bash
# Execute only AFTER a separate successful key-based PuTTY login as hufs-admin.
set -Eeuo pipefail
umask 077
[[ $(id -u) -eq 0 && "$#" -eq 1 && "$1" == '--i-tested-new-key-login' ]] || {
  echo "Usage (from hufs-admin key-authenticated SSH session): sudo /usr/local/sbin/hufs-ssh-harden --i-tested-new-key-login" >&2; exit 2;
}
[[ "$SUDO_USER" == 'hufs-admin' ]] || { echo "Must run via hufs-admin sudo, not root's first-login session." >&2; exit 2; }
[[ -s /home/hufs-admin/.ssh/authorized_keys ]] || { echo "Admin public key missing; refusing SSH changes." >&2; exit 1; }
file=/etc/ssh/sshd_config.d/90-hufs-one-hardening.conf
if [[ -e "$file" ]]; then
  cp -p "$file" "$file.previous"
fi
cat > "$file" <<'EOF'
# HUFS One AI; SSH exposed only to the admin IP in ACG/UFW.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers hufs-admin
X11Forwarding no
PermitEmptyPasswords no
EOF
if ! /usr/sbin/sshd -t; then
  if [[ -f "$file.previous" ]]; then
    mv -f "$file.previous" "$file"
  else
    rm -f "$file"
  fi
  echo "SSH validation failed; restored previous file." >&2
  exit 1
fi
# Config precedence varies by image; verify EFFECTIVE policy, not just the file.
effective=$(/usr/sbin/sshd -T -C user=hufs-admin,host=localhost,addr=127.0.0.1)
for required in 'permitrootlogin no' 'passwordauthentication no' 'kbdinteractiveauthentication no' 'pubkeyauthentication yes'; do
  grep -Fxq "$required" <<< "$effective" || {
    echo "Effective sshd policy differs: $required. Do not reload." >&2
    if [[ -f "$file.previous" ]]; then mv -f "$file.previous" "$file"; else rm -f "$file"; fi
    exit 1
  }
done
systemctl reload ssh
echo "Root/password SSH disabled. KEEP THIS SESSION and test a NEW key-only hufs-admin PuTTY session."
echo "If locked out, use NCP console/recovery with the original authentication key and admin password."
