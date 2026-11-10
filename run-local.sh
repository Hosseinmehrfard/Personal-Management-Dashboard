#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -f .env ]];then echo 'ابتدا .env را بر اساس .env.example بسازید یا install.sh را اجرا کنید';exit 1;fi
docker compose up -d --build
printf 'Local URL: http://127.0.0.1:4173\n'
