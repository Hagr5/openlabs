"""
cloudvault-api entrypoint.

Exposes:
  GET  /healthz   -- plain liveness check, no auth, no sensitive info
  POST /graphql   -- the only functional surface the player interacts with

Context building (get_context) is where the Authorization header becomes
a `user` object available to every resolver via `info.context["user"]`.
This is the ONE place authentication happens; everything downstream is
authorization, decided per-resolver.

The `db` session is obtained via FastAPI's Depends(get_session), not
created manually here -- get_session is a generator that yields the
session and closes it in a `finally` block after the request completes.
Because get_context is itself called as a FastAPI dependency by
strawberry's GraphQLRouter, nested Depends() work normally and the
session gets closed on every request without any extra plumbing here.
"""

from typing import Optional

from fastapi import Depends, FastAPI, Request
from sqlalchemy.orm import Session
from strawberry.fastapi import GraphQLRouter

from app.auth import decode_access_token
from app.db.models import User as UserModel
from app.db.session import get_session, init_db
from app.schema import schema

app = FastAPI(title="CloudVault API", docs_url=None, redoc_url=None)
# docs_url/redoc_url disabled: this is an API-only, GraphQL-only challenge --
# an auto-generated REST docs page would be noise at best and an unintended
# distractor/leak surface at worst. See DESIGN.md anti-cheese checklist.


async def get_context(request: Request, db: Session = Depends(get_session)):
    user: Optional[UserModel] = None

    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        payload = decode_access_token(token)
        if payload:
            user = db.query(UserModel).filter_by(id=payload["sub"]).first()

    return {"db": db, "user": user, "request": request}


graphql_app = GraphQLRouter(schema, context_getter=get_context)
app.include_router(graphql_app, prefix="/graphql")


@app.get("/healthz")
def healthz():
    return {"status": "ok", "service": "cloudvault-api"}


@app.on_event("startup")
def on_startup():
    # Table creation only -- seeding is a separate explicit step (app.seed)
    # run once at container startup via the Dockerfile/compose command, so
    # the reset flow (DESIGN.md section 21) stays deterministic and visible
    # rather than hidden inside app startup.
    init_db()
