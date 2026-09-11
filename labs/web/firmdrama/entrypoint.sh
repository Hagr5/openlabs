#!/bin/sh
set -eu

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
"$BASE_DIR/scripts/init_database.sh"

export FIRMDRAMA_DATABASE_REQUIRED=true
export FIRMDRAMA_DB_HOST=127.0.0.1
export FIRMDRAMA_DB_PORT=3306
export FIRMDRAMA_DB_NAME=firmdrama
export FIRMDRAMA_DB_USER=firmdrama
export FIRMDRAMA_DB_PASSWORD=${FIRMDRAMA_DB_PASSWORD:-firmdrama-local-only}

APP_PID=""
MYSQL_PID_FILE=${FIRMDRAMA_MYSQL_PID_FILE:-/run/mysqld/firmdrama-mysql.pid}

shutdown() {
    status=$?
    trap - EXIT INT TERM
    if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
        kill -TERM "$APP_PID" 2>/dev/null || true
        wait "$APP_PID" 2>/dev/null || true
    fi
    if [ -f "$MYSQL_PID_FILE" ]; then
        mysql_pid=$(cat "$MYSQL_PID_FILE" 2>/dev/null || true)
        if [ -n "$mysql_pid" ] && kill -0 "$mysql_pid" 2>/dev/null; then
            kill -TERM "$mysql_pid" 2>/dev/null || true
            i=0
            while kill -0 "$mysql_pid" 2>/dev/null && [ "$i" -lt 15 ]; do
                sleep 1
                i=$((i + 1))
            done
        fi
        rm -f "$MYSQL_PID_FILE"
    fi
    exit "$status"
}

trap shutdown EXIT INT TERM
# Both the private database and web worker run under the container's dedicated
# unprivileged account. The container has no Linux capabilities.
gunicorn --config "$BASE_DIR/src/gunicorn.conf.py" 'src.app:create_app()' &
APP_PID=$!
wait "$APP_PID"
