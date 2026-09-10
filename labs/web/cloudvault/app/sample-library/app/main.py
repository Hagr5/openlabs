"""
CloudVault sample-library -- Phase 7.

Narratively: a small external "verified reference content" partner that
CloudVault's import feature can pull demo/onboarding documents from.
Mechanically: a fixed, single-purpose HTTP redirector with exactly one
job -- respond to GET /library/sample.pdf with a 302 to metadata-service's
identity endpoint, no matter what.

This is the ONLY vulnerable-by-design property this service has, and it
is intentional and singular:

  - The redirect target is a hardcoded constant, never read from a query
    parameter, header, or anything caller-supplied. This is NOT an open
    redirect -- see DESIGN.md section 6's rejection of that option. An
    attacker-controlled target would let a future stage skip
    metadata-service entirely and collapse the intended chain.
  - This service is reachable only from internal-net (see
    docker-compose.yml). The player cannot resolve its hostname from the
    host, cannot curl it directly, and cannot observe its behavior except
    by routing a real request through import-worker's SSRF (V2/V3).
  - Its hostname (`sample-library`) is deliberately NOT in
    shared.validation.BLOCKED_HOSTNAMES -- see that file's comment. Do
    not add auth, target validation, or any other logic here. That would
    either break the intended bypass or introduce a vulnerability this
    service was explicitly designed not to have.
"""

from fastapi import FastAPI
from fastapi.responses import RedirectResponse

app = FastAPI(title="CloudVault Sample Library", docs_url=None, redoc_url=None)

METADATA_IDENTITY_URL = "http://metadata-service:9100/metadata/identity"


@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "sample-library"}


@app.get("/library/sample.pdf")
def sample_pdf():
    # Fixed target, fixed status code, query string never inspected.
    # Do not change this to read a `target`/`url`/`redirect` parameter.
    return RedirectResponse(url=METADATA_IDENTITY_URL, status_code=302)
