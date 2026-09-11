"""Verify application readiness, seeded records, and generated lab state."""

from __future__ import annotations

import sys
import re
from pathlib import Path

# Allow direct execution from the scripts directory as documented for the
# environment verifier.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.app import create_app
from src.db import get_connection, database_ready

FLAG_PATTERN = re.compile(r"^duck\{[a-z]{24}\}$")
FLAG_SEARCH_PATTERN = re.compile(r"duck\{[a-z]{24}\}")
FINAL_FLAG_PATH = Path("/home/olivia/DoNotOpenThisFolder/olivia.txt")


def main() -> int:
    client = create_app().test_client()
    response = client.get("/health")
    expected = {"status": "ok", "service": "firmdrama"}

    if response.status_code != 200 or response.get_json() != expected:
        print("firmdrama health check failed", file=sys.stderr)
        return 1

    if not database_ready():
        print("firmdrama database readiness check failed", file=sys.stderr)
        return 1

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS count FROM roles")
            if cursor.fetchone()["count"] != 4:
                print("Unexpected role seed count", file=sys.stderr)
                return 1
            cursor.execute("SELECT stage, value FROM flags ORDER BY id")
            flags = cursor.fetchall()
            if len(flags) != 2 or any(not FLAG_PATTERN.fullmatch(row["value"]) for row in flags):
                print("Runtime flag contract check failed", file=sys.stderr)
                return 1
            cursor.execute(
                "SELECT COUNT(*) AS count FROM messages WHERE id = 9006 AND body LIKE %s",
                ("%duck{%",),
            )
            if cursor.fetchone()["count"] != 1:
                print("Intermediate flag insertion check failed", file=sys.stderr)
                return 1
            cursor.execute(
                "SELECT COUNT(*) AS count FROM messages WHERE id = 9006 AND body LIKE %s",
                ("%approval ID: dleg_%",),
            )
            if cursor.fetchone()["count"] != 1:
                print("Delegation approval insertion check failed", file=sys.stderr)
                return 1
            cursor.execute("SELECT COUNT(*) AS count FROM delegation_approvals WHERE intended_user_id = 2 AND delegated_role_id = 499 AND consumed_at IS NULL")
            if cursor.fetchone()["count"] != 1:
                print("Delegation approval check failed", file=sys.stderr)
                return 1
            cursor.execute("SELECT COUNT(*) AS count FROM messages WHERE id IN (9002, 9004) AND body LIKE %s", ("%duck{%",))
            if cursor.fetchone()["count"] != 0:
                print("Intermediate flag redaction check failed", file=sys.stderr)
                return 1

    if not FINAL_FLAG_PATH.exists() or not FLAG_SEARCH_PATTERN.search(FINAL_FLAG_PATH.read_text(encoding="utf-8")):
        print("Final flag file check failed", file=sys.stderr)
        return 1

    print("firmdrama runtime environment check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
