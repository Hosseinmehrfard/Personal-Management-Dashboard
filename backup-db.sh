#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
umask 077
mkdir -p backups
OUT="backups/markaz-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db pg_dump -U markaz -d markaz -Fc --no-owner --no-acl > "$OUT"
if [[ ! -s "$OUT" ]];then rm -f "$OUT";echo 'Backup failed' >&2;exit 1;fi
printf 'Created SQL backup: %s\n' "$OUT"
