import os
import jwt
from datetime import datetime, timedelta, timezone


JWT_SECRET = "crimson7719"
JWT_ALGORITHM = "HS256"

def generate_token(user_id, username, role):
    """Generate JWT token."""
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=24)
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token

def verify_token(token):
    """Verify and decode JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def decode_token_unverified(token):
    """Decode token without verification (for inspection)."""
    try:
        return jwt.decode(token, options={"verify_signature": False})
    except:
        return None
