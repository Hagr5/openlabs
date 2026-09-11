"""
CloudVault internal-vault-api -- Phase 8.

REST, not GraphQL -- see DESIGN.md section 9 for the full rationale.

Holds the vault entries and the final flag. NOT reachable from the host
and NOT in shared.validation.BLOCKED_HOSTNAMES -- its protection is the
Bearer-token auth boundary (V5), not hostname-hiding.

V5: genuine Bearer-token authentication (validated against WORKER_TOKEN).
V6: assume_worker trusts a client-supplied role rather than binding the
    session to WORKER_ROLE. The session token is signed (HMAC-SHA256) so
    the ONLY way to obtain a role=X session is to ask assume_worker for
    it -- forging a session out of thin air is not an alternate solve.
"""

import base64
import hashlib
import hmac
import json
import os

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

# WORKER_ROLE is imported but DELIBERATELY NEVER REFERENCED below -- see
# assume_worker()'s docstring. The correct implementation would bind the
# session's role to WORKER_ROLE; V6 is specifically that this binding
# never happens. Do not "clean up" this import as dead code.
from shared.tokens import WORKER_ROLE, WORKER_TOKEN  # noqa: F401

app = FastAPI(title="CloudVault Internal Vault API", docs_url=None, redoc_url=None)

VAULT_SESSION_SECRET = os.environ.get("VAULT_SESSION_SECRET") or os.environ.get("WORKER_SHARED_SECRET")
if not VAULT_SESSION_SECRET:
    raise RuntimeError(
        "VAULT_SESSION_SECRET (or WORKER_SHARED_SECRET) must be set -- "
        "vault refuses to start without a signing key"
    )


def _require_valid_token(authorization: str) -> None:
    """V5: genuine Bearer-token authentication (unmodified)."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization[len("Bearer "):].strip()
    if token != WORKER_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")


def _sign(payload: bytes) -> str:
    return hmac.new(VAULT_SESSION_SECRET.encode(), payload, hashlib.sha256).hexdigest()


def _issue_session(role: str) -> str:
    payload = json.dumps({"role": role}).encode()
    return base64.b64encode(payload).decode() + "." + _sign(payload)


def _verify_session(token: str) -> dict:
    try:
        b64, sig = token.rsplit(".", 1)
        payload = base64.b64decode(b64)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session")
    if not hmac.compare_digest(sig, _sign(payload)):
        raise HTTPException(status_code=401, detail="Invalid session")
    try:
        return json.loads(payload)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session")


VAULT_ENTRIES = [
    {
        "id": "entry-1",
        "name": "worker-diagnostics",
        "required_role": "cloudvault-import-worker",
        "value": "Routine worker diagnostics: nothing sensitive here. If you can read this, your token is valid.",
    },
    {
        "id": "entry-2",
        "name": "audit-log-archive",
        "required_role": "cloudvault-auditor",
        "value": "Q3 audit log archive -- rotated credentials list (historical, all entries expired).",
    },
    {
        "id": "entry-3",
        "name": "root-secret",
        "required_role": "cloudvault-vault-admin",
        "value": "duck{cloudvault_ssrf_chain_7bf55757}",
    },
]


@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "internal-vault-api"}


@app.get("/vault/entries")
def list_entries():
    """Unauthenticated recon index -- id/name/required_role, never value."""
    return [
        {"id": e["id"], "name": e["name"], "required_role": e["required_role"]}
        for e in VAULT_ENTRIES
    ]


class AssumeWorkerRequest(BaseModel):
    role: str


@app.post("/vault/assume-worker")
def assume_worker(req: AssumeWorkerRequest, authorization: str = Header(default="")):
    """V5 (real) + V6 (the flaw)."""
    _require_valid_token(authorization)
    # VULNERABLE: should bind to WORKER_ROLE; instead trusts req.role as-is.
    return {"session": _issue_session(req.role)}


@app.get("/vault/entries/{entry_id}")
def read_entry(entry_id: str, x_vault_session: str = Header(default="")):
    """Authorizes against the (now signed) role in the session."""
    if not x_vault_session:
        raise HTTPException(status_code=401, detail="Missing session")

    decoded = _verify_session(x_vault_session)
    claimed_role = decoded["role"]

    entry = next((e for e in VAULT_ENTRIES if e["id"] == entry_id), None)
    if entry is None:
        raise HTTPException(status_code=404, detail="Not found")
    if claimed_role != entry["required_role"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    return {"id": entry["id"], "name": entry["name"], "value": entry["value"]}
