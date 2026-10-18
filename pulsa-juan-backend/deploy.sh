#!/usr/bin/env bash
# Runs ON THE SERVER (e.g. via GitHub Actions SSH). Pulls, rebuilds, reloads.
# Never touches .env and never runs migrations (run `npm run migrate:prod` from a dev machine first).
set -euo pipefail
cd /root/code/pulsa-juan
git reset --hard HEAD
git pull --ff-only
npm ci
npm run build -w pulsa-juan-common
cd pulsa-juan-backend
npx prisma generate
npm run build
pm2 reload pulsa-juan-backend || pm2 start dist/src/server.js --name pulsa-juan-backend
echo "Deploy complete: $(git rev-parse --short HEAD)"
