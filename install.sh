#!/usr/bin/env bash
set -Eeuo pipefail
# One-command Ubuntu/Debian installation:
# curl -fsSL https://raw.githubusercontent.com/USER/REPO/main/install.sh | sudo bash -s -- https://github.com/USER/REPO.git dashboard.example.com
if [[ "${EUID}" -ne 0 ]]; then echo 'نصب نیازمند دسترسی sudo است' >&2; exit 1; fi
REPO="${1:-}"; DOMAIN_NEW="${2:-}"; BASE="${MARKAZ_DIR:-/opt/markaz}"
if [[ ! "$REPO" =~ ^https://github\.com/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+(\.git)?$ ]]; then
 echo 'Usage: sudo bash install.sh https://github.com/USER/REPO.git [dashboard.example.com]' >&2;exit 2
fi
if [[ -n "$DOMAIN_NEW" && ! "$DOMAIN_NEW" =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]]; then echo 'دامنه نامعتبر است' >&2;exit 2;fi
if ! command -v apt-get >/dev/null;then echo 'Only Ubuntu/Debian supported';exit 1;fi
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -qq -y ca-certificates curl git openssl >/dev/null
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1;then
 tmp="$(mktemp)";trap 'rm -f "$tmp"' EXIT
 curl -fsSL https://get.docker.com -o "$tmp"
 sh "$tmp"
 rm -f "$tmp";trap - EXIT
fi
systemctl enable --now docker >/dev/null
if [[ -d "$BASE/.git" ]];then
 old="$(git -C "$BASE" remote get-url origin)"
 if [[ "${old%.git}" != "${REPO%.git}" ]];then echo "Existing repository at $BASE differs" >&2;exit 1;fi
 git -C "$BASE" pull --ff-only
elif [[ -e "$BASE" ]];then echo "Directory $BASE exists and is not a git repository" >&2;exit 1
else mkdir -p "$(dirname "$BASE")";git clone --depth 1 "$REPO" "$BASE";fi
cd "$BASE"
if [[ ! -f .env ]];then
 umask 077
 DB_PASS="$(openssl rand -hex 30)"
 SETUP_SECRET="$(openssl rand -hex 32)"
 SESSION_SECRET="$(openssl rand -hex 48)"
 ENCRYPTION="$(openssl rand -hex 32)"
 {
  printf 'DOMAIN=%s\n' "${DOMAIN_NEW:-dashboard.example.com}"
  printf 'POSTGRES_PASSWORD=%s\n' "$DB_PASS"
  printf 'SETUP_TOKEN=%s\n' "$SETUP_SECRET"
  printf 'SESSION_SECRET=%s\n' "$SESSION_SECRET"
  printf 'DATA_ENCRYPTION_KEY=%s\n' "$ENCRYPTION"
  printf 'ALLOWED_AGENT_HOSTS=\n'
  if [[ -n "$DOMAIN_NEW" ]];then printf 'PUBLIC_ORIGIN=https://%s\n' "$DOMAIN_NEW";fi
 } > .env
 chmod 600 .env
 printf '\nINITIAL_SETUP_CODE=%s\n' "$SETUP_SECRET"
 echo 'کد بالا را در صفحه راه‌اندازی اولین مدیر وارد کنید و در جای امن نگهداری کنید.'
fi
# Upgrade older installations without overwriting existing credentials.
if ! grep -q '^POSTGRES_PASSWORD=' .env;then printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 30)" >> .env;fi
if ! grep -q '^DATA_ENCRYPTION_KEY=' .env;then printf 'DATA_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" >> .env;fi
if ! grep -q '^SESSION_SECRET=' .env;then printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 48)" >> .env;fi
if ! grep -q '^SETUP_TOKEN=' .env;then
 SETUP_SECRET="$(openssl rand -hex 32)"
 printf 'SETUP_TOKEN=%s\n' "$SETUP_SECRET" >> .env
 printf 'INITIAL_SETUP_CODE=%s\n' "$SETUP_SECRET"
 echo 'کد اختصاصی راه‌اندازی ایجاد شد. در صفحه نخست پنل وارد کنید.'
fi
if [[ -n "$DOMAIN_NEW" ]];then
 sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN_NEW/" .env
 if grep -q "^PUBLIC_ORIGIN=" .env; then sed -i "s|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=https://$DOMAIN_NEW|" .env; else printf "PUBLIC_ORIGIN=https://%s\n" "$DOMAIN_NEW" >> .env;fi
fi
chmod 600 .env
DOMAIN_VAL="$(grep '^DOMAIN=' .env | cut -d= -f2-)"
# Also secure existing v4 domain installations when upgraded without a new domain argument.
if [[ -n "$DOMAIN_VAL" && "$DOMAIN_VAL" != dashboard.example.com ]];then
 if grep -q '^PUBLIC_ORIGIN=' .env;then sed -i "s|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=https://$DOMAIN_VAL|" .env
 else printf 'PUBLIC_ORIGIN=https://%s\n' "$DOMAIN_VAL" >> .env;fi
 chmod 600 .env
fi
if [[ "$BASE" == /opt/markaz && -f /usr/local/sbin/personal-dashboard-update ]]; then
 install -o root -g root -m 0750 "$BASE/scripts/server-update.sh" /usr/local/sbin/personal-dashboard-update
fi
export DASHBOARD_REVISION="$(git rev-parse HEAD)"
if [[ -n "$DOMAIN_NEW" || ( -n "$DOMAIN_VAL" && "$DOMAIN_VAL" != dashboard.example.com ) ]];then
 docker compose --profile https up -d --build --remove-orphans
 echo "MARKAZ_URL=https://$DOMAIN_VAL"
 echo 'DNS دامنه باید به سرور اشاره کند؛ پورت‌های 80 و 443 باید باز باشند.'
else
 docker compose up -d --build --remove-orphans
 echo 'MARKAZ_URL=http://127.0.0.1:4173 (فقط روی سرور)'
 echo 'اتصال از رایانه: ssh -L 4173:127.0.0.1:4173 USER@SERVER_IP'
fi
printf 'APP_DIR=%s\n' "$BASE"
echo 'در نخستین ورود، نام کاربری و رمز دلخواه مدیر را با کد INITIAL_SETUP_CODE تعیین کنید.'
printf 'برای نمایش مجدد کد روی سرور (فقط مالک سرور): sudo grep ^SETUP_TOKEN= %s/.env\n' "$BASE"
echo 'حساب‌های موجود در ارتقای نسخه دست‌نخورده باقی می‌مانند.'
echo 'نسخه SQL اطلاعات را روی Docker volume دائمی pg_data نگهداری می‌کند.'
