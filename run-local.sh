#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -f .env ]];then echo 'ابتدا .env را بر اساس .env.example بسازید یا install.sh را اجرا کنید';exit 1;fi
export DASHBOARD_REVISION="$(git rev-parse HEAD 2>/dev/null || true)"
docker compose up -d --build
printf 'Local URL: http://127.0.0.1:4173\n'
