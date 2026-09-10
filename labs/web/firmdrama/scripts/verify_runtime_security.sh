#!/bin/sh
set -eu

FINAL_DIRECTORY=/home/olivia/DoNotOpenThisFolder
FINAL_FLAG_PATH="$FINAL_DIRECTORY/olivia.txt"
MYSQL_RUNTIME_DIRECTORY=/run/mysqld
MYSQL_SOCKET="$MYSQL_RUNTIME_DIRECTORY/firmdrama-mysql.sock"
MYSQL_PID_FILE="$MYSQL_RUNTIME_DIRECTORY/firmdrama-mysql.pid"

if ! ps -eo user:64=,args= | awk '$1 == "firmdrama" && $0 ~ /gunicorn/ { found = 1 } END { exit !found }'; then
    echo "Gunicorn is not running as firmdrama" >&2
    exit 1
fi

if [ "$(stat -c '%U:%G:%a' "$FINAL_DIRECTORY")" != "firmdrama:firmdrama:750" ]; then
    echo "Final flag directory permissions do not match the runtime contract" >&2
    exit 1
fi

if [ "$(stat -c '%U:%G:%a' "$FINAL_FLAG_PATH")" != "firmdrama:firmdrama:600" ]; then
    echo "Final flag file permissions do not match the runtime contract" >&2
    exit 1
fi

if [ "$(stat -c '%U:%G:%a' "$MYSQL_RUNTIME_DIRECTORY")" != "firmdrama:firmdrama:750" ]; then
    echo "MySQL runtime directory permissions do not match the hardening contract" >&2
    exit 1
fi

if [ ! -S "$MYSQL_SOCKET" ] || [ ! -f "$MYSQL_PID_FILE" ]; then
    echo "MySQL must use the dedicated runtime directory for its socket and PID file" >&2
    exit 1
fi

if [ -e /tmp/firmdrama-mysql.sock ] || [ -e /tmp/firmdrama-mysql.pid ]; then
    echo "MySQL socket or PID file must not be created in shared /tmp" >&2
    exit 1
fi

echo "firmdrama runtime security check passed"
