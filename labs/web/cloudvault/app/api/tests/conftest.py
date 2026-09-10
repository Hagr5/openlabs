"""
Pytest fixtures for cloudvault-api.

Uses a fresh temp-FILE SQLite database per test session, not `:memory:` --
SQLAlchemy's default pooling for `sqlite:///:memory:` opens a NEW empty
in-memory database per connection, so a real request cycle (which opens
more than one connection) would silently lose data between calls. A temp
file avoids that gotcha entirely.

Phase 4 addition: these tests must never make a real network call to
import-worker -- there is no worker container in this test environment,
only the api's own code under test. `_mock_worker_fetch` below patches
app.schema.request_fetch (the name bound in schema.py's own namespace,
per how `from X import Y` binds names) to a safe default success response
for every test, autouse=True. Individual tests that need different
worker behavior (errors, unreachable, inspecting call args) override it
again inside the test body via monkeypatch -- the autouse default just
means tests that don't care about worker behavior at all (most of
test_imports.py) don't need to know this plumbing exists.

Full-stack tests against a REAL running worker container belong in
Phase 10, not here -- see DESIGN.md's phased roadmap.
"""

import os
import tempfile

# MUST happen before importing anything under app.*, since app/db/session.py
# reads DATABASE_URL at import time.
_tmp_fd, _tmp_path = tempfile.mkstemp(suffix=".db")
os.close(_tmp_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_path}"
os.environ.setdefault("JWT_SECRET", "test-secret-not-for-release")
# Dummy values only -- request_fetch itself is mocked below for every test,
# so these are never actually dialed. They exist purely so nothing crashes
# on a missing env var if a future change forgets to mock something.
os.environ.setdefault("WORKER_URL", "http://unused-in-tests:9000")
os.environ.setdefault("WORKER_SHARED_SECRET", "unused-in-tests")

import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password
from app.db.models import Role, User
from app.db.session import SessionLocal, init_db
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def _setup_db():
    init_db()
    yield
    os.remove(_tmp_path)


@pytest.fixture(autouse=True)
def _mock_worker_fetch(monkeypatch):
    """
    Default: every executeImport call in every test gets a canned SUCCESS
    response, as if the worker fetched something and got HTTP 200 back.
    Tests that need to exercise error/unreachable paths call
    `monkeypatch.setattr("app.schema.request_fetch", ...)` again inside
    the test body -- that later call simply overrides this one for the
    remainder of that test.
    """
    def _default_fake_fetch(url, method="GET", body=None, headers=None):
        return {"ok": True, "status_code": 200, "body": "mocked-worker-response"}

    monkeypatch.setattr("app.schema.request_fetch", _default_fake_fetch)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def make_user():
    def _make(username: str, password: str = "testpass123", role=Role.PLAYER):
        db = SessionLocal()
        try:
            user = User(username=username, password_hash=hash_password(password), role=role)
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
        finally:
            db.close()
    return _make


@pytest.fixture
def auth_header():
    def _header(user: User):
        token = create_access_token(user.id, user.username, user.role.value)
        return {"Authorization": f"Bearer {token}"}
    return _header


def gql(client, query, headers=None, variables=None):
    payload = {"query": query}
    if variables is not None:
        payload["variables"] = variables
    resp = client.post("/graphql", json=payload, headers=headers or {})
    assert resp.status_code == 200, resp.text
    return resp.json()
