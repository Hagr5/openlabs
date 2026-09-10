"""
import-worker entrypoint -- Phase 4, Step 3: real fetch logic.

This endpoint is the SSRF-capable component described in DESIGN.md
section 6. Two validation layers exist on purpose, and they are NOT
redundant:

  1. cloudvault-api already called shared.validation.validate_source()
     once, at createImport/updateImport time, against the URL the user
     SUBMITTED.
  2. This file calls the exact same function again, against the URL it
     is about to actually fetch, right before fetching it.

Layer 2 existing at all is good practice (never trust a caller's prior
validation blindly). But it is a STATIC, textual check only -- it has no
idea what a redirect will do. `follow_redirects=True` below is a
deliberate, realistic feature choice (a real "import a document from a
URL" product would want this -- lots of legitimate URLs redirect). The
gap between "the URL I checked" and "the URL I actually end up
requesting after redirects" is DESIGN.md's V3b, and it is not fixed here
on purpose -- see shared/validation.py's own docstring for why it
structurally cannot be fixed at that layer.
"""

import os

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from shared.validation import SourceValidationError, validate_source

app = FastAPI(title="CloudVault Import Worker", docs_url=None, redoc_url=None)

WORKER_SHARED_SECRET = os.environ.get("WORKER_SHARED_SECRET", "")
MAX_RESPONSE_BYTES = 20_000
REQUEST_TIMEOUT_SECONDS = 5.0


def _check_secret(x_worker_secret: str) -> None:
    if not WORKER_SHARED_SECRET or x_worker_secret != WORKER_SHARED_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


class FetchRequest(BaseModel):
    url: str
    method: str = "GET"
    body: str | None = None
    headers: dict[str, str] = {}


class FetchResponse(BaseModel):
    ok: bool
    status_code: int | None = None
    body: str | None = None
    error: str | None = None


@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "import-worker"}


@app.post("/internal/fetch", response_model=FetchResponse)
def fetch(req: FetchRequest, x_worker_secret: str = Header(default="")):
    _check_secret(x_worker_secret)

    # Layer 2 validation -- see module docstring for why this is
    # deliberately still just a static, non-redirect-aware check.
    try:
        safe_url = validate_source(req.url)
    except SourceValidationError as exc:
        return FetchResponse(ok=False, error=str(exc))

    method = req.method.upper()
    if method not in ("GET", "POST"):
        return FetchResponse(ok=False, error="Unsupported method.")

    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=REQUEST_TIMEOUT_SECONDS,
        ) as http_client:
            resp = http_client.request(
                method,
                safe_url,
                content=req.body if method == "POST" else None,
                headers=req.headers,
            )
    except httpx.RequestError as exc:
        return FetchResponse(ok=False, error=f"Request failed: {exc.__class__.__name__}")

    body_text = resp.text[:MAX_RESPONSE_BYTES]
    return FetchResponse(ok=True, status_code=resp.status_code, body=body_text)
