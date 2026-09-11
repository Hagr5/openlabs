import secrets
import time
from functools import wraps

from flask import current_app, g, jsonify, redirect, request
from itsdangerous import BadSignature, URLSafeTimedSerializer

ADMIN_TRUSTED_TYPES = {"Admin", "Service"}


class SessionManager:
    def __init__(self, secret, cookie_name, ttl):
        self._store = {}
        self._serializer = URLSafeTimedSerializer(secret, salt="fsm-session")
        self.cookie_name = cookie_name
        self.ttl = ttl

    def create(self, **claims):
        sid = secrets.token_urlsafe(32)
        now = time.time()
        self._store[sid] = {
            "claims": claims,
            "created_at": now,
            "expires_at": now + self.ttl,
        }
        return self._serializer.dumps(sid)

    def _resolve_sid(self, token):
        try:
            return self._serializer.loads(token, max_age=self.ttl + 60)
        except BadSignature:
            return None

    def get(self):
        token = request.cookies.get(self.cookie_name)
        if not token:
            return None
        sid = self._resolve_sid(token)
        if sid is None:
            return None
        record = self._store.get(sid)
        if record is None or record["expires_at"] < time.time():
            self._store.pop(sid, None)
            return None
        return dict(record["claims"])

    def destroy(self):
        token = request.cookies.get(self.cookie_name)
        if not token:
            return
        sid = self._resolve_sid(token)
        if sid is not None:
            self._store.pop(sid, None)

    def attach(self, response, token):
        response.set_cookie(
            self.cookie_name,
            token,
            httponly=True,
            samesite="Lax",
            path="/",
            max_age=self.ttl,
        )
        return response

    def clear(self):
        self._store.clear()

    def active_count(self):
        now = time.time()
        return sum(1 for r in self._store.values() if r["expires_at"] > now)


def get_session():
    return current_app.extensions["sessions"].get()


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        session = get_session()
        if session is None:
            return jsonify(error="authentication required"), 401
        g.session = session
        return view(*args, **kwargs)

    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        session = get_session()
        if session is None:
            return jsonify(error="authentication required"), 401
        if session.get("account_type") not in ADMIN_TRUSTED_TYPES:
            return jsonify(error="insufficient privileges for this operation"), 403
        g.session = session
        return view(*args, **kwargs)

    return wrapper
