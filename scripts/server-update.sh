#!/usr/bin/env bash
# Install this file once as /usr/local/sbin/personal-dashboard-update, root-owned 0750.
set -Eeuo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
APP=/opt/markaz
cd "$APP"
[[ -d .git ]] || { echo 'missing git checkout' >&2;exit 1; }
[[ -f .env ]] || { echo 'missing installation secrets' >&2;exit 1; }
[[ "$(git branch --show-current)" == main ]] || { echo 'not on main' >&2;exit 1; }
/usr/bin/git diff --quiet HEAD -- || { echo 'tracked files have local changes' >&2;exit 1; }
# Safe backup before code and database schema migration.
/usr/bin/bash "$APP/backup-db.sh"
/usr/bin/git fetch origin main
/usr/bin/git merge --ff-only FETCH_HEAD
export DASHBOARD_REVISION="$(/usr/bin/git rev-parse HEAD)"
[[ "$DASHBOARD_REVISION" == "$(/usr/bin/git rev-parse FETCH_HEAD)" ]] || { echo 'checkout does not match origin/main' >&2;exit 1; }
profiles=()
domain="$(sed -n 's/^DOMAIN=//p' .env)"
if [[ -n "$domain" && "$domain" != dashboard.example.com ]]; then profiles=(--profile https); fi
/usr/bin/docker compose "${profiles[@]}" up -d --build --remove-orphans --wait --wait-timeout 120
/usr/bin/docker compose ps
/usr/bin/docker compose exec -T app node -e 'fetch("http://127.0.0.1:4173/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
