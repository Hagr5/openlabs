"""
CloudVault fake metadata service -- Phase 6.

Emulates the security CONCEPT of a cloud workload metadata/identity
endpoint (DESIGN.md section 7). This service is deliberately, entirely
boring:

  - No authentication.
  - No rate limiting.
  - No request inspection beyond "a GET arrived."
  - Same fixed response to every caller, every time.

This is not an oversight -- it is the whole point. Per DESIGN.md's
vulnerability model, this service is NOT a vulnerability site. A real
cloud metadata service answers anything that reaches it from inside the
right network segment; identity is established by network location, not
by anything this service checks. The flaw that matters is entirely
upstream, in import-worker's SSRF + redirect-follow behavior (V2/V3) --
whatever gets a request to this address when it shouldn't have been able
to is the actual security failure, not this service answering honestly.

Do not add auth, rate limiting, or "cleverness" here. If you find
yourself wanting to, that's a sign you're about to accidentally FIX V4
(DESIGN.md section 6) rather than build it -- V4 is specifically that
this service trusts network location alone, with no equivalent check to
import-worker's shared-secret pattern. Any authentication added here
would close that boundary and break the intended chain.

The token is a fixed, synthetic, CTF-local constant, now defined once in
shared/tokens.py and imported here (Phase 8: internal-vault-api needs
the exact same value to validate against -- see that file's docstring
for why this moved out of being duplicated in two places). It is never
generated, rotated, or derived from anything real, and it is identical
across container restarts and full `docker compose down -v` resets --
this determinism is a design requirement, not a simplification we might
"fix" later.
"""

from fastapi import FastAPI

from shared.tokens import WORKER_ROLE, WORKER_TOKEN

app = FastAPI(title="CloudVault Metadata Service", docs_url=None, redoc_url=None)


@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "metadata-service"}


@app.get("/metadata/identity")
def identity():
    return {"role": WORKER_ROLE, "token": WORKER_TOKEN}
