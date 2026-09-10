"""Authentication endpoints."""

from collections import deque
import math
import re
from threading import Lock
from time import monotonic

from flask import Blueprint, current_app, g, jsonify, request

from src.responses import error_response
from src.auth import authenticate, require_auth, revoke_session

auth_api = Blueprint("auth_api", __name__)
LOGIN_WINDOW_SECONDS = 60
LOGIN_MAX_FAILURES = 5
LOGIN_MAX_KEYS = 1024
_failed_logins: dict[str, deque[float]] = {}
_failed_login_lock = Lock()


def _login_key(username: str) -> str:
    return f"{request.remote_addr or 'unknown'}:{username.casefold()}"


def _is_rate_limited(key: str, now: float) -> tuple[bool, int]:
    with _failed_login_lock:
        # Expire inactive keys as well as the current one; never evict an active
        # lockout to admit an attacker-controlled stream of new usernames.
        for stale_key, attempts in list(_failed_logins.items()):
            while attempts and now - attempts[0] >= LOGIN_WINDOW_SECONDS:
                attempts.popleft()
            if not attempts:
                del _failed_logins[stale_key]
        if key not in _failed_logins:
            if len(_failed_logins) >= LOGIN_MAX_KEYS:
                return True, LOGIN_WINDOW_SECONDS
            _failed_logins[key] = deque()
        attempts = _failed_logins[key]
        if len(attempts) >= LOGIN_MAX_FAILURES:
            return True, max(1, math.ceil(LOGIN_WINDOW_SECONDS - (now - attempts[0])))
        # Reserve before password verification so concurrent failures cannot
        # pass the check together. A successful login clears its reservations.
        attempts.append(now)
        return False, 0


def _clear_failed_logins(key: str) -> None:
    with _failed_login_lock:
        _failed_logins.pop(key, None)


@auth_api.post("/login")
def login():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response("invalid_request", "A JSON object is required.", 400)
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error_response("invalid_request", "Username and password are required.", 400)
    if not username or len(username) > 80 or not password or len(password) > 256:
        return error_response("invalid_request", "Username or password length is invalid.", 400)
    username = username.strip().lower()
    if not re.fullmatch(r"[a-z0-9._-]{1,80}", username):
        return error_response("invalid_request", "Username must use ASCII letters, digits, dots, underscores or hyphens.", 400)
    key = _login_key(username)
    now = monotonic()
    limited, retry_after = _is_rate_limited(key, now)
    if limited:
        response = jsonify({"error": "rate_limited", "message": "Too many failed login attempts. Try again later."})
        response.status_code = 429
        response.headers["Retry-After"] = str(retry_after)
        return response
    result = authenticate(username, password)
    if not result:
        return error_response("invalid_credentials", "The supplied credentials are invalid.", 401)
    _clear_failed_logins(key)
    token, user = result
    response = jsonify({"token": token, "user": user})
    if request.headers.get("X-firmdrama-Client") == "browser":
        response.set_cookie(
            current_app.config["BROWSER_COOKIE_NAME"],
            token,
            max_age=2 * 60 * 60,
            secure=current_app.config["BROWSER_COOKIE_SECURE"],
            httponly=True,
            samesite="Strict",
            path="/",
        )
    return response, 200


@auth_api.post("/logout")
@require_auth
def logout():
    revoke_session(g.auth_token)
    response = jsonify({"status": "signed_out"})
    response.delete_cookie(
        current_app.config["BROWSER_COOKIE_NAME"],
        secure=current_app.config["BROWSER_COOKIE_SECURE"],
        httponly=True,
        samesite="Strict",
        path="/",
    )
    return response, 200
