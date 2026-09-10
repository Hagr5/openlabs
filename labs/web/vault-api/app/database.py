"""SQLite database operations for VaultAPI."""

import sqlite3
from typing import Optional, List, Dict, Any
from config import DATABASE_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Initialize database schema."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            bio TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            legacy_password_hash TEXT
        )
    """)
    conn.commit()
    conn.close()


def seed_data():
    """Seed the database with initial users."""
    conn = get_connection()
    cursor = conn.cursor()

    existing = cursor.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if existing > 0:
        conn.close()
        return

    now = "2024-01-15T08:00:00.000000"

    # Precomputed bcrypt hashes (cost factor 4) keep seeding deterministic
    # and fast on low-CPU containers. The weak legacy MD5 hash on `mohamed`
    # is the intentional challenge seed.
    users = [
        {
            "username": "analyst",
            "email": "analyst@vault.internal",
            "password_hash": "$2b$04$1dliG5zDCmUE46f8NHpS2.YHpBCcYUK2s8SqIxznG2XT25vpsKGlC",
            "role": "user",
            "bio": "Security Analyst — threat monitoring and incident response.",
            "legacy_password_hash": None,
        },
        {
            "username": "admin",
            "email": "admin@vault.internal",
            "password_hash": "$2b$04$kDRmh0B7bLMy1i93WoBxP.xUK8/lgSDR580KGAog9IkK9rsoYevzC",
            "role": "admin",
            "bio": "System Administrator — full platform access.",
            "legacy_password_hash": None,
        },
        {
            "username": "mohamed",
            "email": "mohamed@vault.internal",
            "password_hash": "$2b$04$48Sl//EEp1db1YoLThFGI.fWVQI8LAhoaRiHqw/NgRiU425ymfuRa",
            "role": "user",
            "bio": "falah",
            "legacy_password_hash": "8afa847f50a716e64932d995c8e7435a",
        },
        {
            "username": "fatma",
            "email": "fatma@vault.internal",
            "password_hash": "$2b$04$BDywIUTC.Z3VwDChxAngP.OxI6Bc1WihtfO7ivU5aFZmylAXQjbfW",
            "role": "user",
            "bio": "Data Analyst — reporting and analytics.",
            "legacy_password_hash": None,
        },
        {
            "username": "karim",
            "email": "karim@vault.internal",
            "password_hash": "$2b$04$Qnz1wYQx2VCe4Elq0VZZieq3mZx9MgwfZXvv2HUovF54687zpOQWa",
            "role": "user",
            "bio": "DevOps Engineer — infrastructure and CI/CD.",
            "legacy_password_hash": None,
        },
    ]

    try:
        for user in users:
            cursor.execute(
                """INSERT OR IGNORE INTO users (username, email, password_hash, role, bio,
                   created_at, legacy_password_hash)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    user["username"],
                    user["email"],
                    user["password_hash"],
                    user["role"],
                    user["bio"],
                    now,
                    user["legacy_password_hash"],
                ),
            )
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()


def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def get_all_users() -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM users").fetchall()
    conn.close()
    return [dict(row) for row in rows]


def reset_db():
    """Reset database to initial state (in-place, safe with multiple workers)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name='users'")
    conn.commit()
    conn.close()
    seed_data()
