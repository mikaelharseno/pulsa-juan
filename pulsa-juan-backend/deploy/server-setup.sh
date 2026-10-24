#!/usr/bin/env bash
# One-time bootstrap for a bare Ubuntu droplet (run as root):
#   bash server-setup.sh pulsajuan.studiosclo.uk
# Installs Node 20 + pm2 + nginx + certbot, adds swap, clones the repo and
# installs the nginx site. Afterwards: write pulsa-juan-backend/.env, run
# deploy.sh, then `certbot --nginx -d <domain>`.
set -euo pipefail
DOMAIN="${1:?usage: server-setup.sh <domain>}"
REPO="${REPO:-https://github.com/mikaelharseno/pulsa-juan.git}"
APP_DIR=/root/code/pulsa-juan

export DEBIAN_FRONTEND=noninteractive
# fresh droplets run unattended-upgrades for the first minutes and hold the dpkg lock
for _ in $(seq 1 60); do fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || break; sleep 10; done
apt-get update -y
apt-get install -y ca-certificates curl git nginx certbot python3-certbot-nginx ufw

# swap: tsc + prisma generate can exceed 1 GB RAM
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v node >/dev/null || ! node -v | grep -q '^v20\.'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2
pm2 startup systemd -u root --hp /root >/dev/null

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

mkdir -p /root/code
[ -d "$APP_DIR/.git" ] || git clone "$REPO" "$APP_DIR"

sed "s/__DOMAIN__/$DOMAIN/g" "$APP_DIR/pulsa-juan-backend/deploy/nginx.conf" > /etc/nginx/sites-available/pulsa-juan
ln -sf /etc/nginx/sites-available/pulsa-juan /etc/nginx/sites-enabled/pulsa-juan
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "Setup done. Next: create $APP_DIR/pulsa-juan-backend/.env, run deploy.sh, then certbot --nginx -d $DOMAIN"
