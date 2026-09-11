#!/bin/sh
# Bootstrap for the FieldOps 360 lab.
# Runs as UID 1000. The root filesystem is read only. tini stays PID 1.

set -eu

APP_DIR="/app"
FLAG_FILE="${APP_DIR}/flag.txt"

echo '{"lvl":"info","msg":"entrypoint: starting","uid":"'$(id -u)'"}'

if [ -z "${FLAG:-}" ] && [ ! -s "${FLAG_FILE}" ]; then
    echo '{"lvl":"error","msg":"entrypoint: no FLAG env and no flag file"}' >&2
    exit 1
fi

if [ "$(id -u)" -eq 0 ]; then
    echo '{"lvl":"error","msg":"entrypoint: running as root is forbidden"}' >&2
    exit 1
fi

cd "${APP_DIR}"
exec gunicorn -c gunicorn.conf.py "app:create_app()"
