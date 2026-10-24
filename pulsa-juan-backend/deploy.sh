#!/usr/bin/env bash
# Runs ON THE SERVER (by hand or via GitHub Actions SSH). Pulls, rebuilds, reloads.
# Never touches .env and never runs migrations (run `npm run migrate:prod` from a dev machine first).
set -euo pipefail
cd /root/code/pulsa-juan
git reset --hard HEAD
git pull --ff-only
# backend + common only: skips Expo/React Native/Vite (small droplets run out of memory otherwise)
npm ci -w pulsa-juan-common -w pulsa-juan-backend --include-workspace-root
npm run build -w pulsa-juan-common
cd pulsa-juan-backend
npx prisma generate
npm run build
pm2 reload pulsa-juan-backend --update-env || pm2 start dist/src/server.js --name pulsa-juan-backend
pm2 save
echo "Deploy complete: $(git rev-parse --short HEAD)"
