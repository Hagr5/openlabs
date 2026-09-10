#!/usr/bin/env bash
set -euo pipefail

echo "Stopping SnapSync..."
docker compose down -v

echo "Rebuilding and starting clean..."
docker compose up -d --build

echo "Done. Main app available at http://localhost:3000"
