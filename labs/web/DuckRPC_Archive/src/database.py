import os
import sqlite3


DATABASE_PATH = os.getenv(
    "DB_PATH",
    "/tmp/duckrpc.db"
)


def get_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def initialize_database():
    if os.path.exists(DATABASE_PATH):
        os.remove(DATABASE_PATH)

    conn = get_connection()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    """)

    # Public documents table
    cursor.execute("""
        CREATE TABLE documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            owner TEXT NOT NULL,
            content TEXT NOT NULL
        )
    """)

    # Sensitive internal records
    cursor.execute("""
        CREATE TABLE internal_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            record_name TEXT NOT NULL,
            record_value TEXT NOT NULL
        )
    """)

    # Insert standard user
    cursor.execute("""
        INSERT INTO users (username, password, role)
        VALUES (?, ?, ?)
    """, (
        "alice",
        "AliceArchive2026!",
        "employee"
    ))

    # Insert normal documents
    documents = [
        (
            "Employee Handbook",
            "HR",
            "Internal employee handbook and workplace guidelines."
        ),
        (
            "Remote Work Policy",
            "Operations",
            "Guidelines for employees working remotely."
        ),
        (
            "Security Guidelines",
            "Security Team",
            "General security guidance for employees."
        ),
        (
            "Incident Response Overview",
            "Security Team",
            "High-level incident response procedures."
        )
    ]

    cursor.executemany("""
        INSERT INTO documents (title, owner, content)
        VALUES (?, ?, ?)
    """, documents)

    # Get flag from environment
    flag = os.getenv("FLAG")

    if not flag:
        raise RuntimeError("FLAG environment variable is required")

    # Insert sensitive record
    cursor.execute("""
        INSERT INTO internal_records (record_name, record_value)
        VALUES (?, ?)
    """, (
        "archive_recovery_key",
        flag
    ))

    conn.commit()
    conn.close()