#!/bin/sh
# =============================================================================
# entrypoint.sh — CTF web challenge bootstrap.
#
# Contract:
#   * Executes as UID 1000 (ctf) — never root.
#   * Root filesystem is read-only; writable paths are tmpfs (compose).
#   * tini (PID 1) reaps zombies and forwards SIGTERM; we exec so gunicorn
#     receives signals directly (fast, graceful shutdowns on redeploy).
# =============================================================================

set -eu

APP_DIR="/app"
FLAG_FILE="${APP_DIR}/flag.txt"

echo '{"lvl":"info","msg":"entrypoint: starting","uid":"'$(id -u)'"}'

# Fail fast (crash loop) if neither flag channel is configured. A silent
# placeholder flag in production burns player trust and platform tickets.
if [ -z "${FLAG:-}" ] && [ ! -s "${FLAG_FILE}" ]; then
    echo '{"lvl":"error","msg":"entrypoint: no FLAG env and no flag file — refusing to start"}' >&2
    exit 1
fi

# Sanity: never run as root.
if [ "$(id -u)" -eq 0 ]; then
    echo '{"lvl":"error","msg":"entrypoint: running as root is forbidden"}' >&2
    exit 1
fi

# exec replaces the shell with gunicorn; tini remains PID 1 above it.

echo '{"lvl":"info","msg":"entrypoint: initializing database"}'

python -c "from app import init_db; init_db()"

echo '{"lvl":"info","msg":"entrypoint: database ready"}'

cd "${APP_DIR}"
exec gunicorn -c gunicorn.conf.py app:app
