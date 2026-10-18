#!/usr/bin/env bash
# Creates/updates the test database schema before jest runs.
set -euo pipefail
cd "$(dirname "$0")/.."
export DATABASE_URL="${TEST_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/pulsa_juan_test}"
export DIRECT_URL="$DATABASE_URL"
npx prisma db push --skip-generate --accept-data-loss >/dev/null
