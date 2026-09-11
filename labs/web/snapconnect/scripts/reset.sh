#!/bin/sh
# Reset the lab to a clean state without touching the source.
set -eu
cd "$(dirname "$0")/.."
docker compose down -v --remove-orphans
docker compose up -d --build
docker compose ps
