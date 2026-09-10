"""Small MySQL access layer shared by the application and lifecycle scripts."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import pymysql

from src.config import load_config


def connection_kwargs(database: bool = True) -> dict:
    config = load_config()
    values = {
        "host": config.DB_HOST,
        "port": config.DB_PORT,
        "user": config.DB_USER,
        "password": config.DB_PASSWORD,
        "autocommit": False,
        "cursorclass": pymysql.cursors.DictCursor,
        "connect_timeout": 3,
    }
    if database:
        values["database"] = config.DB_NAME
    return values


def get_connection(database: bool = True):
    """Open a configured MySQL connection."""

    return pymysql.connect(**connection_kwargs(database=database))


def database_ready() -> bool:
    """Return whether the configured database accepts a simple query."""

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 AS ready")
                return cursor.fetchone()["ready"] == 1
    except pymysql.MySQLError:
        return False


@contextmanager
def transaction() -> Iterator:
    """Yield a connection and commit or roll back one transaction."""

    connection = get_connection()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
