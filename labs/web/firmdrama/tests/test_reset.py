"""Test fixture reseeding; host reset.py is tested separately."""

import re
from helpers import seed_test_database

from src.app import create_app
from src.db import get_connection


def test_reset_restores_clean_state():
    seed_test_database()
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT stage, value FROM flags ORDER BY stage")
            first_flags = {row["stage"]: row["value"] for row in cursor.fetchall()}
    seed_test_database()
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT stage, value FROM flags ORDER BY stage")
            second_flags = {row["stage"]: row["value"] for row in cursor.fetchall()}
            cursor.execute("SELECT COUNT(*) AS count FROM delegation_approvals WHERE intended_user_id = 2 AND delegated_role_id = 499 AND consumed_at IS NULL")
            assert cursor.fetchone()["count"] == 1
    assert set(first_flags) == {"final", "intermediate"}
    assert all(re.fullmatch(r"duck\{[a-z]{24}\}", value) for value in second_flags.values())
    assert first_flags != second_flags
    client = create_app().test_client()
    login = client.post("/api/v1/auth/login", json={"username": "thisismike", "password": "mike@123"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.get_json()['token']}"}
    assert client.get("/api/v3/dashboard", headers=headers).status_code == 403
    assert client.get("/api/v1/me", headers=headers).get_json()["role_id"] == 1
    assert client.get("/api/v1/dashboards/1042", headers=headers).status_code == 200
