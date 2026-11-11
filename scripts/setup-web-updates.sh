#!/usr/bin/env bash
# One-time server bootstrap. Usage:
# sudo bash scripts/setup-web-updates.sh 'ssh-ed25519 AAAA... github-dashboard-deploy'
set -Eeuo pipefail
[[ "$EUID" -eq 0 ]] || { echo 'sudo required' >&2;exit 1; }
PUBKEY="${1:-}"
[[ "$PUBKEY" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]{60,120}\ .*$ ]] || { echo 'Expected an ed25519 SSH public key with comment' >&2;exit 2; }
[[ "$PUBKEY" != *$'\n'* && "$PUBKEY" != *$'\r'* ]] || exit 2
APP=/opt/markaz
[[ -d "$APP/.git" && -f "$APP/.env" ]] || { echo 'Installation not found at /opt/markaz' >&2;exit 1; }
install -o root -g root -m 0750 "$APP/scripts/server-update.sh" /usr/local/sbin/personal-dashboard-update
if ! id deploy >/dev/null 2>&1;then useradd --create-home --shell /bin/bash deploy;fi
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# Restrict the key to one update command: no shell/forwarding/PTY.
printf 'restrict,command="sudo -n /usr/local/sbin/personal-dashboard-update" %s\n' "$PUBKEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
printf 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/personal-dashboard-update\n' > /etc/sudoers.d/personal-dashboard-deploy
chmod 0440 /etc/sudoers.d/personal-dashboard-deploy
visudo -cf /etc/sudoers.d/personal-dashboard-deploy >/dev/null
printf 'Updater bootstrap complete. Keep the private SSH key only in GitHub Environment Secrets.\n'
