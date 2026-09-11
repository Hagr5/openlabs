"""Authentication and JWT token operations for VaultAPI."""

import jwt
from datetime import datetime, timedelta
from typing import Optional
from config import SECRET_KEY, ALGORITHM, TOKEN_EXPIRY_MINUTES


def create_token(username: str, role: str, user_id: int) -> str:
    """Create a JWT token for a user."""
    payload = {
        "sub": username,
        "role": role,
        "user_id": user_id,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRY_MINUTES),
        "iss": "vault-api",
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a bcrypt hash."""
    bcrypt = __import__('bcrypt')
    return bcrypt.checkpw(password.encode(), password_hash.encode())
