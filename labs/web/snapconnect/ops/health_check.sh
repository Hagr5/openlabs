#!/bin/sh
# Basic availability checks for the SnapConnect lab.
# Usage: ops/health_check.sh [base_url]
set -eu

BASE="${1:-http://localhost:8081}"

command -v curl >/dev/null 2>&1 || { echo "curl is required"; exit 2; }

echo "[1/3] portal page"
curl -sf "$BASE/" | grep -q "SnapConnect"

echo "[2/3] health endpoint"
curl -sf "$BASE/health.php" | grep -q '"status":"ok"'

echo "[3/3] graphql endpoint"
curl -sf "$BASE/graphql" \
    -H 'Content-Type: application/json' \
    --data '{"query":"{ serverVersion }"}' | grep -q '"serverVersion"'

echo "health check passed"
