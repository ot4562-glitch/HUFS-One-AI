#!/usr/bin/env bash
# Container-only synthetic proof. Never an operator backup/deployment entrypoint.
set -euo pipefail
[[ "${HUFS_RECOVERY_CONTAINER:-}" == 'synthetic-ci-only' ]]
[[ "$(id -u)" == 0 && -f /.dockerenv ]]
[[ -x /opt/hufs-node && -f /work/tests/api/fixtures/postgres-recovery-live.mjs ]]
umask 077
export PATH=/usr/lib/postgresql/18/bin:/usr/local/bin:/usr/bin:/bin
data="$(mktemp -d /tmp/hufs-recovery-data.XXXXXXXX)"
password_file="$(mktemp /tmp/hufs-recovery-admin.XXXXXXXX)"
printf '%s\n' 'synthetic-container-only' > "$password_file"
chown postgres:postgres "$data" "$password_file"
started=0
finish() {
  if [[ "$started" == 1 ]]; then
    gosu postgres pg_ctl stop -D "$data" -m fast -w -t 20 >/dev/null
  fi
  # Container lifecycle removes its data; no recursive host deletion.
  unlink "$password_file"
}
trap finish EXIT
gosu postgres initdb -D "$data" -U hufs_local_admin --encoding=UTF8 --locale=C \
  --auth-local=trust --auth-host=scram-sha-256 --pwfile="$password_file" >/dev/null
gosu postgres pg_ctl start -D "$data" -l "$data/server.log" \
  -o '-h 127.0.0.1 -p 55448 -k /tmp -c shared_buffers=64MB -c max_connections=30' -w -t 15 >/dev/null
started=1
export HUFS_RECOVERY_LIVE=1
export HUFS_RECOVERY_BIN=/usr/lib/postgresql/18/bin
export HUFS_RECOVERY_ADMIN_URL=postgres://hufs_local_admin:synthetic-container-only@127.0.0.1:55448/postgres
cd /work
/opt/hufs-node tests/api/fixtures/postgres-recovery-live.mjs --synthetic
