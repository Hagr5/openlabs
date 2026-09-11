"""Regression checks for approved deployment-audit fixes."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from threading import Barrier
import time

import pytest
import pymysql

from helpers import bearer_login
from scripts.check_source_secrets import contaminated_files
from src.app import create_app
from src.api import auth_routes
from src.api.room_routes import parse_booking_time
from src.auth import MAX_USER_SESSIONS
from src.db import get_connection, transaction


def test_limiter_expires_keys_and_preserves_active_limits(monkeypatch):
    monkeypatch.setattr(auth_routes, "_failed_logins", {})
    monkeypatch.setattr(auth_routes, "LOGIN_MAX_KEYS", 2)
    for _ in range(5):
        assert auth_routes._is_rate_limited("account", 100) == (False, 0)
    assert auth_routes._is_rate_limited("another", 100) == (False, 0)
    assert auth_routes._is_rate_limited("third", 100)[0]
    assert auth_routes._is_rate_limited("account", 101)[0]
    assert auth_routes._is_rate_limited("fresh", 161) == (False, 0)
    assert set(auth_routes._failed_logins) == {"fresh"}


def test_login_normalization_has_one_rate_limit_key(monkeypatch):
    monkeypatch.setattr(auth_routes, "_failed_logins", {})
    seen = []
    monkeypatch.setattr(auth_routes, "authenticate", lambda username, password: seen.append(username))
    client = create_app().test_client()
    for username in ["thisismike", "THISISMIKE", "thisismike ", " thisismike", "ThisIsMike"]:
        assert client.post("/api/v1/auth/login", json={"username": username, "password": "invalid"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"username": "thisismike", "password": "invalid"}).status_code == 429
    assert client.post("/api/v1/auth/login", json={"username": "thísismike", "password": "invalid"}).status_code == 400
    assert seen == ["thisismike"] * 5


def test_timezone_normalization_and_database_range():
    assert parse_booking_time("2030-01-01T10:00:00+03:00") == datetime(2030, 1, 1, 7)
    for value in ["2030-01-01", "2030-01-01T10:00:00", "0001-01-01T00:00:00Z", "9999-12-31T23:59:59-01:00", "2030-01-01T10:00:00+00:99"]:
        with pytest.raises((ValueError, OverflowError)):
            parse_booking_time(value)


def test_invalid_booking_ids_and_normalized_storage(client):
    headers = bearer_login(client)
    body = {"room_id": 12, "matter_code": "REGRESSION", "purpose": "Timezone check",
            "starts_at": "2030-01-01T10:00:00+03:00", "ends_at": "2030-01-01T11:00:00+03:00"}
    for room_id in [12.9, True, "12", None, 0, -1, 2147483648, float("inf")]:
        assert client.post("/api/v1/bookings", headers=headers, json={**body, "room_id": room_id}).status_code == 400
    result = client.post("/api/v1/bookings", headers=headers, json=body)
    assert result.status_code == 201
    rows = client.get("/api/v1/bookings/calendar", headers=headers).get_json()["bookings"]
    booking = next(row for row in rows if row["booking_id"] == result.get_json()["booking_id"])
    assert booking["starts_at"] == "2030-01-01T07:00:00Z"
    body.update(starts_at="2030-01-02T10:00:00.123456+03:00", ends_at="2030-01-02T10:00:00.234567+03:00")
    result = client.post("/api/v1/bookings", headers=headers, json=body)
    assert result.status_code == 201
    rows = client.get("/api/v1/bookings/calendar", headers=headers).get_json()["bookings"]
    booking = next(row for row in rows if row["booking_id"] == result.get_json()["booking_id"])
    assert booking["starts_at"] == "2030-01-02T07:00:00.123456Z"
    assert booking["ends_at"] == "2030-01-02T07:00:00.234567Z"


def test_concurrent_bookings_cannot_overlap(client, monkeypatch):
    headers = bearer_login(client)
    execute = pymysql.cursors.Cursor.execute

    def delayed_overlap_read(cursor, query, args=None):
        result = execute(cursor, query, args)
        if query.startswith("SELECT id FROM bookings WHERE room_id"):
            time.sleep(0.1)  # Widen the former check/insert race deterministically.
        return result

    monkeypatch.setattr(pymysql.cursors.Cursor, "execute", delayed_overlap_read)
    barrier = Barrier(2)
    def book(_):
        local = create_app().test_client()
        barrier.wait(timeout=5)
        return local.post("/api/v1/bookings", headers=headers, json={
            "room_id": 12, "matter_code": "RACE", "purpose": "Concurrency regression",
            "starts_at": "2031-01-01T10:00:00Z", "ends_at": "2031-01-01T11:00:00Z",
        }).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(book, range(2))) == [201, 409]


def test_booking_overlap_boundaries(client):
    headers = bearer_login(client)
    body = {"room_id": 12, "matter_code": "BOUNDARY", "purpose": "Overlap regression",
            "starts_at": "2032-01-01T10:00:00Z", "ends_at": "2032-01-01T11:00:00Z"}
    assert client.post("/api/v1/bookings", headers=headers, json=body).status_code == 201
    for start, end in [("10:00", "11:00"), ("09:30", "10:30"), ("10:30", "11:30"),
                       ("09:00", "12:00"), ("10:15", "10:45")]:
        result = client.post("/api/v1/bookings", headers=headers, json={**body,
            "starts_at": f"2032-01-01T{start}:00Z", "ends_at": f"2032-01-01T{end}:00Z"})
        assert result.status_code == 409
    for start, end in [("09:00", "10:00"), ("11:00", "12:00")]:
        result = client.post("/api/v1/bookings", headers=headers, json={**body,
            "starts_at": f"2032-01-01T{start}:00Z", "ends_at": f"2032-01-01T{end}:00Z"})
        assert result.status_code == 201


def test_session_issuance_removes_expired_and_bounds_active_rows(client):
    headers = bearer_login(client)
    with transaction() as connection:
        with connection.cursor() as cursor:
            cursor.execute("UPDATE sessions SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND)")
    for _ in range(MAX_USER_SESSIONS + 1):
        bearer_login(client)
    assert client.get("/api/v1/me", headers=headers).status_code == 401
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS count, SUM(expires_at <= UTC_TIMESTAMP()) AS expired FROM sessions")
            assert cursor.fetchone() == {"count": MAX_USER_SESSIONS, "expired": 0}


def test_source_scanner_detects_contaminated_runtime_script(tmp_path):
    directory = tmp_path / "scripts"
    directory.mkdir()
    clean = directory / "clean.py"
    clean.write_text("# No runtime value")
    assert contaminated_files([tmp_path]) == []
    contaminated = directory / "bad.py"
    contaminated.write_text("# duck{" + "a" * 24 + "}")
    assert contaminated_files([tmp_path]) == [contaminated]
