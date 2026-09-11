#!/bin/sh
# Managed function runtime bootstrap.
#
# The container starts privileged solely to materialize the runtime workspace
# secret from the environment into its file location, prepare the packages
# volume for the sandbox identity, and then drop all privileges before the
# server process starts.
set -e

RUNTIME_USER="sbx_duck1051"
PACKAGES_DIR="/packages"

if [ -n "${FLAG:-}" ]; then
  printf '%s\n' "$FLAG" > /flag.txt
  chown "$RUNTIME_USER:$RUNTIME_USER" /flag.txt
  chmod 0400 /flag.txt
fi

mkdir -p "$PACKAGES_DIR" /tmp
chown -R "$RUNTIME_USER:$RUNTIME_USER" "$PACKAGES_DIR" /tmp 2>/dev/null || true

# The secret must only be reachable through the filesystem from here on.
unset FLAG

exec su-exec "$RUNTIME_USER:$RUNTIME_USER" node src/server.js
