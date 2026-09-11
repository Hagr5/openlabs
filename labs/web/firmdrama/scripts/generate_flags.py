"""Generate runtime-only flags and place the final flag in the container."""

from __future__ import annotations

import secrets
import hashlib
import string
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pymysql

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db import transaction

FINAL_FLAG_PATH = Path("/home/olivia/DoNotOpenThisFolder/olivia.txt")


def new_flag() -> str:
    return f"duck{{{''.join(secrets.choice(string.ascii_lowercase) for _ in range(24))}}}"


def new_delegation_approval_id() -> str:
    """Create a per-reset Executive Facilities delegation approval ID."""

    return f"dleg_{secrets.token_urlsafe(24)}"


def generate_and_store_flags() -> tuple[str, str]:
    intermediate = new_flag()
    final = new_flag()
    delegation_approval_id = new_delegation_approval_id()
    generated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    reset_id = secrets.token_hex(16)

    FINAL_FLAG_PATH.parent.mkdir(parents=True, exist_ok=True)
    FINAL_FLAG_PATH.parent.chmod(0o750)
    FINAL_FLAG_PATH.write_text(
        "Olivia executive archive\n"
        "Fictional sensitive material for the firmdrama challenge.\n"
        f"Final flag: {final}\n",
        encoding="utf-8",
    )
    FINAL_FLAG_PATH.chmod(0o600)

    for attempt in range(3):
        try:
            with transaction() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM flags")
                    cursor.execute("DELETE FROM delegation_approvals")
                    cursor.execute(
                        "INSERT INTO flags (id, stage, value, generated_at, reset_id) VALUES (%s, %s, %s, %s, %s), (%s, %s, %s, %s, %s)",
                        (1, "intermediate", intermediate, generated_at, reset_id, 2, "final", final, generated_at, reset_id),
                    )
                    cursor.execute(
                        "INSERT INTO delegation_approvals (approval_hash, intended_user_id, delegated_role_id, source_message_id, created_at, expires_at, reset_id) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (hashlib.sha256(delegation_approval_id.encode()).hexdigest(), 2, 499, 9006, generated_at, generated_at + timedelta(hours=8), reset_id),
                    )
                    cursor.execute(
                        "UPDATE messages SET body = REPLACE(REPLACE(body, 'DELEGATION_APPROVAL_PLACEHOLDER', %s), 'INTERMEDIATE_FLAG_PLACEHOLDER', %s) WHERE id = 9006",
                        (delegation_approval_id, intermediate),
                    )
            break
        except pymysql.err.OperationalError as error:
            if error.args[0] not in {1205, 1213} or attempt == 2:
                raise
            time.sleep(0.2 * (attempt + 1))
    return intermediate, final


if __name__ == "__main__":
    generate_and_store_flags()
    print("Runtime flags generated")
