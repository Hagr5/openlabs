#!/bin/sh
# Generate a new random secret and share it with the frontend
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "$JWT_SECRET" > /secret/jwt_secret.txt
exec "$@"
