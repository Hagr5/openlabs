#!/bin/sh
echo "Waiting for JWT_SECRET from backend..."
while [ ! -f /secret/jwt_secret.txt ]; do
  sleep 1
done
export JWT_SECRET=$(cat /secret/jwt_secret.txt)
echo "JWT_SECRET loaded."
exec "$@"
