"""
Authentication for cloudvault-api.

Deliberately simple and NOT part of the intended vulnerability chain.
DESIGN.md section 2.2 / "PLAYER AUTHENTICATION" is explicit that auth itself
is not the challenge -- so this should be boringly correct. If you (the
author) ever find yourself tempted to weaken this file to make the challenge
"easier," don't -- weaken something in schema.py's resolvers instead, where
it's an intentional, documented flaw rather than an accidental one.

JWT is used purely as a bearer token the player passes in an Authorization
header; there is no session state server-side beyond the DB user row.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from passlib.context import CryptContext

# In production/release you MUST override this via environment variable.
# Never commit a real-looking secret here -- see DESIGN.md "Anti-Cheese"
# section: no secrets baked into images.
JWT_SECRET = os.environ.get("JWT_SECRET", "CHANGE-ME-DEV-ONLY-NOT-FOR-RELEASE")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "120"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str, username: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
