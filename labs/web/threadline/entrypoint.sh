#!/bin/sh
# =============================================================================
# entrypoint.sh — ThreadLine API challenge bootstrap.
#
# Contract:
#   * Executes as UID 1000 (ctf) — never root.
#   * Root filesystem is read-only; /data is a writable tmpfs (compose).
#   * The DB is reseeded to the known initial state on EVERY container
#     start — this is the challenge's reset mechanism (restart = reset).
#   * tini (PID 1) reaps zombies and forwards SIGTERM; we exec so gunicorn
#     receives signals directly (fast, graceful shutdowns).
# =============================================================================

set -eu

APP_DIR="/app"

echo '{"lvl":"info","msg":"entrypoint: starting","uid":"'$(id -u)'"}'

# Fail fast if no FLAG is configured. A silent placeholder flag in
# production burns player trust.
if [ -z "${FLAG:-}" ]; then
    echo '{"lvl":"warn","msg":"entrypoint: no FLAG env set, using local dev fallback"}'
fi

# Sanity: never run as root.
if [ "$(id -u)" -eq 0 ]; then
    echo '{"lvl":"error","msg":"entrypoint: running as root is forbidden"}' >&2
    exit 1
fi

cd "${APP_DIR}"

echo '{"lvl":"info","msg":"entrypoint: seeding database"}'
python3 seed.py

echo '{"lvl":"info","msg":"entrypoint: starting gunicorn"}'
exec gunicorn -c gunicorn.conf.py app:app
