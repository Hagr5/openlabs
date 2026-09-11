#!/usr/bin/env python3
"""Recreate this firmdrama lab from its existing images: python reset.py."""

from __future__ import annotations

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

from scripts.sync_flag_hash import read_running_hashes, update_metadata

ROOT = Path(__file__).resolve().parent
HEALTH_URL = "http://127.0.0.1:8080/health"
FRESH_STATE_CHECK = """
from src.db import get_connection
with get_connection() as connection:
    with connection.cursor() as cursor:
        cursor.execute('SELECT role_id FROM users WHERE id = 1')
        assert cursor.fetchone()['role_id'] == 1, 'Starting role is incorrect'
        cursor.execute('SELECT COUNT(*) AS count FROM sessions')
        assert cursor.fetchone()['count'] == 0, 'Old sessions remain'
"""


@contextmanager
def reset_lock(path: Path):
    """Use an OS lock that is released even if the reset process exits abruptly."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as stream:
        stream.seek(0, os.SEEK_END)
        if stream.tell() == 0:
            stream.write(b"0")
            stream.flush()
        stream.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise RuntimeError("Another firmdrama reset is already running.") from error
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == "nt":
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def docker(*arguments: str) -> None:
    result = subprocess.run(
        ["docker", "compose", *arguments], cwd=ROOT, capture_output=True,
        text=True, timeout=180,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode:
        raise RuntimeError(f"Docker Compose {arguments[0]} failed (exit {result.returncode}).")


def recreate(service: str) -> None:
    # Reuse the trusted local image; reset must not build or download anything.
    docker("up", "-d", "--no-build", "--pull", "never", "--force-recreate",
           "--no-deps", "--wait", "--wait-timeout", "120", service)


def verify_endpoint() -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(HEALTH_URL, timeout=5) as response:
        if response.status != 200 or json.load(response) != {"service": "firmdrama", "status": "ok"}:
            raise RuntimeError("Published firmdrama health check failed.")


def reset_lab() -> None:
    try:
        print("Closing ingress and recreating the application...", flush=True)
        docker("stop", "--timeout", "5", "firmdrama_ingress")
        recreate("firmdrama")
        docker("exec", "-T", "firmdrama", "python3", "/opt/firmdrama/scripts/verify_environment.py")
        docker("exec", "-T", "firmdrama", "python3", "-c", FRESH_STATE_CHECK)
        update_metadata(ROOT / "lab.yml", read_running_hashes())
        print("Fresh state verified; starting a new ingress container...", flush=True)
        recreate("firmdrama_ingress")
        verify_endpoint()
    except (Exception, KeyboardInterrupt):
        try:
            docker("stop", "--timeout", "5", "firmdrama_ingress")
            print("Reset did not complete. Ingress is stopped; fix the error and retry.", file=sys.stderr)
        except (Exception, KeyboardInterrupt):
            print("Reset failed and ingress shutdown could not be confirmed. Check Docker before continuing.", file=sys.stderr)
        raise
    print("firmdrama reset complete. Checker hashes refreshed. Open http://127.0.0.1:8080 and sign in again.")


def main() -> int:
    argparse.ArgumentParser(description=__doc__).parse_args()
    try:
        with reset_lock(ROOT / "tmp" / "reset.lock"):
            reset_lab()
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"Reset failed: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Reset interrupted.", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
