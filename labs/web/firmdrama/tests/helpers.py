"""Database fixture and account helpers used only by integration tests."""

import os
from pathlib import Path
import subprocess


def seed_test_database():
    """Restore controlled test fixtures; this is not a player security reset."""
    root = Path("/opt/firmdrama")
    socket = os.getenv("FIRMDRAMA_MYSQL_SOCKET", "/run/mysqld/firmdrama-mysql.sock")
    for name in ("reset.sql", "seed.sql"):
        with (root / "database" / name).open("rb") as source:
            subprocess.run(["mysql", "--protocol=socket", f"--socket={socket}", "-uroot"],
                           stdin=source, check=True, capture_output=True)
    subprocess.run(["python3", str(root / "scripts/generate_flags.py")],
                   check=True, capture_output=True, text=True)


def sign_in(client, *, browser=False):
    """Sign in with the seeded account and return the session response body."""

    headers = {"X-firmdrama-Client": "browser"} if browser else {}
    response = client.post(
        "/api/v1/auth/login",
        headers=headers,
        json={"username": "thisismike", "password": "mike@123"},
    )
    assert response.status_code == 200
    return response.get_json()


def bearer_login(client):
    """Return Authorization headers for an ordinary account session."""

    payload = sign_in(client)
    return {"Authorization": f"Bearer {payload['token']}"}


def session_login(client):
    """Return Authorization headers and the signed-in user summary."""

    payload = sign_in(client)
    return {"Authorization": f"Bearer {payload['token']}"}, payload["user"]
