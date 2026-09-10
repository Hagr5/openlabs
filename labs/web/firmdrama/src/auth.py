"""Authentication, password verification, and bearer-session helpers."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import current_app, g, request

from src.db import get_connection, transaction
from src.responses import error_response

SESSION_HOURS = 2
MAX_USER_SESSIONS = 20


def verify_password(password: str, encoded: str) -> bool:
    """Verify the fixed PBKDF2 format used by the seeded player account."""

    try:
        algorithm, iterations, encoded_salt, encoded_digest = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(encoded_salt + "==")
        expected = base64.urlsafe_b64decode(encoded_digest + "==")
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def revoke_session(token: str) -> None:
    with transaction() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM sessions WHERE token_hash = %s", (hash_token(token),))


def user_summary(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "role_id": user["role_id"],
        "role_name": user["role_name"],
    }


def authenticate(username: str, password: str) -> tuple[str, dict] | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = %s AND u.is_login_enabled = TRUE",
                (username,),
            )
            user = cursor.fetchone()
    if not user or not verify_password(password, user["password_hash"]):
        return None

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    expires = now + timedelta(hours=SESSION_HOURS)
    with transaction() as connection:
        with connection.cursor() as cursor:
            # Serialize session issuance per account and bound retained state.
            cursor.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (user["id"],))
            cursor.execute("DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP()")
            cursor.execute("SELECT id FROM sessions WHERE user_id = %s ORDER BY id DESC", (user["id"],))
            stale_ids = cursor.fetchall()[MAX_USER_SESSIONS - 1:]
            for stale in stale_ids:
                cursor.execute("DELETE FROM sessions WHERE id = %s", (stale["id"],))
            cursor.execute(
                "INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (%s, %s, %s, %s)",
                (user["id"], hash_token(token), expires, now),
            )
    return token, user_summary(user)


def current_user() -> dict | None:
    header = request.headers.get("Authorization", "")
    token = ""
    auth_via_cookie = False
    if header.startswith("Bearer "):
        token = header.removeprefix("Bearer ").strip()
    elif not header:
        token = request.cookies.get(current_app.config["BROWSER_COOKIE_NAME"], "").strip()
        auth_via_cookie = bool(token)
    if not token:
        return None
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT u.*, r.name AS role_name FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id WHERE s.token_hash = SHA2(%s, 256) AND s.expires_at > UTC_TIMESTAMP()",
                (token,),
            )
            user = cursor.fetchone()
    if user:
        g.auth_token = token
        g.auth_via_cookie = auth_via_cookie
    return user


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user:
            return error_response("authentication_required", "A valid bearer token is required.", 401)
        if (
            g.auth_via_cookie
            and request.method not in {"GET", "HEAD", "OPTIONS"}
            and request.headers.get("X-firmdrama-Client") != "browser"
        ):
            return error_response("csrf_protection_required", "The required browser request header is missing.", 403)
        g.current_user = user
        return view(*args, **kwargs)

    return wrapped


def require_role(role_id: int):
    def decorator(view):
        @wraps(view)
        @require_auth
        def wrapped(*args, **kwargs):
            if g.current_user["role_id"] != role_id:
                return error_response("insufficient_role", "This resource requires additional permissions.", 403)
            return view(*args, **kwargs)

        return wrapped

    return decorator
