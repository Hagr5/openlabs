"""VaultAPI configuration constants."""

import os

SECRET_KEY = "vault-api-internal-secret-key-2024-do-not-share"
ALGORITHM = "HS256"
TOKEN_EXPIRY_MINUTES = 60

# Flag is injected at runtime via the FLAG environment variable (compose
# auto-loads .env). Never hard-code the challenge flag in source code.
FLAG = os.environ.get("FLAG", "duck{flag_not_configured}")

DATABASE_PATH = "/tmp/vault.db"

ANALYST_USERNAME = "analyst"
ANALYST_PASSWORD = "analyst123"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin@vault2024"

INTERNAL_HEADER = "X-Internal-Request"
INTERNAL_HEADER_VALUE = "true"
