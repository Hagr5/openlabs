"""Regression coverage for the post-audit security controls."""

import re

from helpers import bearer_login
from src.app import create_app


def test_security_headers_and_trusted_hosts():
    client = create_app().test_client()
    response = client.get("/")

    assert response.headers["Content-Security-Policy"].startswith("default-src 'self'")
    assert "unsafe-inline" not in response.headers["Content-Security-Policy"]
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert client.get("/health", headers={"Host": "audit.invalid"}).status_code == 400


def test_oversized_request_is_rejected_before_authentication():
    client = create_app().test_client()
    response = client.post(
        "/api/v1/auth/login",
        data=b"x" * 65537,
        content_type="application/json",
    )

    assert response.status_code == 413
    assert response.get_json()["error"] == "request_too_large"


def test_login_rate_limit_blocks_repeated_failures(client):
    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login",
            json={"username": "rate-limit-audit-user", "password": "invalid"},
        )
        assert response.status_code == 401

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "rate-limit-audit-user", "password": "invalid"},
    )
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) >= 1


def test_browser_cookie_is_httponly_and_cookie_writes_require_custom_header(client):
    response = client.post(
        "/api/v1/auth/login",
        headers={"X-firmdrama-Client": "browser"},
        json={"username": "thisismike", "password": "mike@123"},
    )
    assert response.status_code == 200
    cookie = response.headers["Set-Cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=Strict" in cookie
    assert client.get("/api/v1/me").status_code == 200

    blocked = client.patch("/api/v1/users/1/profile", json={"display_name": "Mike"})
    assert blocked.status_code == 403
    assert blocked.get_json()["error"] == "csrf_protection_required"

    logout = client.post(
        "/api/v1/auth/logout",
        headers={"X-firmdrama-Client": "browser"},
    )
    assert logout.status_code == 200
    assert client.get("/api/v1/me").status_code == 401


def test_invalid_profile_update_does_not_consume_approval(client):
    headers = bearer_login(client)
    message = client.get(
        "/api/v1/dashboards/1042/conversations/5001/messages/9006",
        headers=headers,
    )
    approval_match = re.search(
        r"approval ID: (dleg_[A-Za-z0-9_-]+)",
        message.get_json()["body"],
    )
    assert approval_match

    invalid = client.patch(
        "/api/v1/users/1/profile",
        headers=headers,
        json={
            "display_name": "x" * 121,
            "role_id": 499,
            "delegation_approval_id": approval_match.group(1),
        },
    )
    assert invalid.status_code == 400

    valid = client.patch(
        "/api/v1/users/1/profile",
        headers=headers,
        json={
            "role_id": 499,
            "delegation_approval_id": approval_match.group(1),
        },
    )
    assert valid.status_code == 200


def test_booking_id_is_database_generated(client):
    headers = bearer_login(client)
    response = client.post(
        "/api/v1/bookings",
        headers=headers,
        json={
            "room_id": 12,
            "matter_code": "AUDIT-1",
            "purpose": "Security regression test",
            "starts_at": "2026-10-01T10:00:00Z",
            "ends_at": "2026-10-01T11:00:00Z",
        },
    )

    assert response.status_code == 201
    assert response.get_json()["booking_id"] > 7002
