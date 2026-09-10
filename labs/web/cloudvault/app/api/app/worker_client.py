"""
Thin client for cloudvault-api to call import-worker's /internal/fetch.

This is the ONLY place in cloudvault-api that talks to the worker.
Keeping it isolated here (rather than inlining an httpx call directly in
schema.py) means Phase 6+ changes to the worker's contract only touch one
file.
"""

import os

import httpx

WORKER_URL = os.environ.get("WORKER_URL", "http://import-worker:9000")
WORKER_SHARED_SECRET = os.environ.get("WORKER_SHARED_SECRET", "")
WORKER_TIMEOUT_SECONDS = 10.0


class WorkerCallError(Exception):
    """Raised when the worker itself is unreachable (not for fetch failures
    the worker reports normally -- those come back as ok=False in the
    response body, which the caller handles separately)."""


def request_fetch(
    url: str,
    method: str = "GET",
    body: str | None = None,
    headers: dict[str, str] | None = None,
) -> dict:
    """
    Phase 8: `headers` here means the PLAYER-SUPPLIED headers the worker
    should send when it fetches `url` (e.g. Authorization: Bearer <token>
    for internal-vault-api) -- travels inside the JSON payload below.
    This is a completely separate channel from the `X-Worker-Secret`
    header set on THIS function's own outbound HTTP call (that's the
    api-to-worker auth boundary, Boundary 2 -- never touched by anything
    the player supplies). The two cannot collide.
    """
    try:
        resp = httpx.post(
            f"{WORKER_URL}/internal/fetch",
            json={"url": url, "method": method, "body": body, "headers": headers or {}},
            headers={"X-Worker-Secret": WORKER_SHARED_SECRET},
            timeout=WORKER_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        raise WorkerCallError(f"Could not reach import-worker: {exc.__class__.__name__}") from exc
