#!/bin/sh
# entrypoint.sh — techvault-api
#
# Guarantees a fully deterministic starting state on every container start:
# delete any leftover SQLite file, recreate schema, seed fixed data, then
# hand off to the real process (tini -> node server.js).
#
# This is what "reset instructions: just restart the container" means in
# the player-facing README — no manual DB surgery required.
set -eu

DB_PATH="${DB_PATH:-/app/data/techvault.db}"

echo "[entrypoint] resetting database at ${DB_PATH}"
rm -f "${DB_PATH}" "${DB_PATH}-wal" "${DB_PATH}-shm"

echo "[entrypoint] seeding fixed data"
node db/seed.js

echo "[entrypoint] starting server"
exec "$@"
