"""
GraphQL schema for cloudvault-api -- through Phase 7.

Import/job lifecycle: createImport, updateImport, executeImport,
cancelImport, jobs, importJob, serviceStatus.

DESIGN.md V1 (TOCTOU) is live in this file (Phase 5): `update_import`
no longer re-syncs `validated_source` after a source change, and
`execute_import` no longer compares `source` to `validated_source`
before fetching. See the VULNERABLE comments inline on both resolvers.

Phase 8 adds `method`/`body`/`headers` to ImportInput/ImportUpdateInput
so the worker can make an authenticated request to internal-vault-api
(Authorization header, POST body for assumeWorker). These fields are
NOT part of the V1 invariant -- there was never a "validated" concept
for them to go stale from. They are write-only: not exposed on the
ImportJob GraphQL type, since nothing in the intended chain requires
reading them back.

`serviceStatus` (Phase 7, revised) is deliberately mundane and contains
no internal hostnames/URLs -- the actual discovery mechanism for
sample-library is the pre-seeded demo import job (see app/seed.py),
not this field. See that file's comment for why.

The safe-baseline version of this file (Phase 3, Step 3, before V1/V2
existed) is preserved in git history / PRIVATE_SOLUTION.md, not here.

Identifiers (User.id, ImportJob.id/ownerId/workerId, and every `id`
argument) are typed as `strawberry.ID`, not plain `str`, per DESIGN.md's
schema draft (`id: ID!`). This matters beyond cosmetics: GraphQL's `ID`
scalar only gets registered in the schema's actual type map if something
uses it -- an all-`str` schema silently has no usable `ID` type at all,
which is exactly what broke the ID!-typed test queries.

Object-level authorization note (DESIGN.md section 19): every resolver
that touches an Import must check ownership itself. There is no global
"is this user allowed" shortcut anywhere in this file, on purpose.
"""

import json
from typing import Optional

import strawberry
from strawberry.types import Info

from app.auth import create_access_token, verify_password
from app.worker_client import WorkerCallError, request_fetch
from app.db.models import ImportStatus
from app.db.models import Import as ImportModel
from app.db.models import User as UserModel
from shared.validation import SourceValidationError, validate_source

TERMINAL_STATUSES = {ImportStatus.COMPLETED, ImportStatus.CANCELLED, ImportStatus.FAILED}

ALLOWED_METHODS = {"GET", "POST"}
MAX_HEADER_COUNT = 10
MAX_HEADER_VALUE_LENGTH = 500


def _validate_method(method: str) -> str:
    normalized = (method or "GET").upper()
    if normalized not in ALLOWED_METHODS:
        raise Exception("Unsupported method. Use GET or POST.")
    return normalized


def _serialize_headers(headers) -> Optional[str]:
    """Converts a list of HeaderInput into the JSON string stored on the
    Import row. Hygiene caps only (count, value length) -- not a security
    boundary, see DESIGN.md section 9's guardrails note. The actual
    destination-side protection is validate_source(), not header content."""
    if not headers:
        return None
    if len(headers) > MAX_HEADER_COUNT:
        raise Exception(f"Too many headers (max {MAX_HEADER_COUNT}).")
    pairs = []
    for h in headers:
        if len(h.value) > MAX_HEADER_VALUE_LENGTH:
            raise Exception(f"Header value too long (max {MAX_HEADER_VALUE_LENGTH} chars).")
        pairs.append({"name": h.name, "value": h.value})
    return json.dumps(pairs)


def _require_user(info: Info) -> UserModel:
    user = info.context.get("user")
    if user is None:
        raise Exception("Not authenticated")
    return user


def _get_owned_import(db, user: UserModel, import_id: str) -> ImportModel:
    job = db.query(ImportModel).filter_by(id=import_id).first()
    if job is None or job.owner_id != user.id:
        # Deliberately the SAME message whether the job doesn't exist at
        # all or belongs to someone else -- a distinguishable error here
        # would be an existence oracle, i.e. its own small IDOR.
        raise Exception("Import not found")
    return job


@strawberry.type
class User:
    id: strawberry.ID
    username: str
    role: str
    organization_id: str

    @staticmethod
    def from_model(m: UserModel) -> "User":
        return User(
            id=strawberry.ID(m.id),
            username=m.username,
            role=m.role.value if hasattr(m.role, "value") else m.role,
            organization_id=m.organization_id,
        )


@strawberry.type
class AuthPayload:
    token: str
    user: User


@strawberry.type
class ImportJob:
    id: strawberry.ID
    owner_id: strawberry.ID
    source: str
    format: Optional[str]
    status: str
    result: Optional[str]
    worker_id: Optional[strawberry.ID]

    @staticmethod
    def from_model(m: ImportModel) -> "ImportJob":
        return ImportJob(
            id=strawberry.ID(m.id),
            owner_id=strawberry.ID(m.owner_id),
            source=m.source,
            format=m.format,
            status=m.status.value if hasattr(m.status, "value") else m.status,
            result=m.result,
            worker_id=strawberry.ID(m.worker_id) if m.worker_id else None,
        )


@strawberry.input
class HeaderInput:
    """One HTTP header the player wants the worker to send. Phase 8:
    needed for the Authorization: Bearer <token> header when talking to
    internal-vault-api. A list-of-pairs, not a map, because GraphQL has
    no native dictionary scalar -- see DESIGN.md section 9's schema note."""
    name: str
    value: str


@strawberry.input
class ImportInput:
    source: str
    format: Optional[str] = None
    method: str = "GET"
    body: Optional[str] = None
    headers: Optional[list[HeaderInput]] = None


@strawberry.input
class ImportUpdateInput:
    source: Optional[str] = None
    method: Optional[str] = None
    body: Optional[str] = None
    headers: Optional[list[HeaderInput]] = None


@strawberry.type
class ServiceStatus:
    api: str
    worker: str


@strawberry.type
class Query:
    @strawberry.field
    def viewer(self, info: Info) -> User:
        user = info.context.get("user")
        if user is None:
            raise Exception("Not authenticated")
        return User.from_model(user)

    @strawberry.field
    def jobs(self, info: Info) -> list[ImportJob]:
        user = _require_user(info)
        db = info.context["db"]
        rows = (
            db.query(ImportModel)
            .filter_by(owner_id=user.id)
            .order_by(ImportModel.created_at.desc())
            .all()
        )
        return [ImportJob.from_model(r) for r in rows]

    @strawberry.field
    def service_status(self) -> ServiceStatus:
        # Public, no auth required (DESIGN.md section 5/17): a genuinely
        # boring distractor field, deliberately containing NO internal
        # hostnames, URLs, or anything else useful to recon. It previously
        # leaked the sample-library URL directly -- removed on review,
        # since an unauthenticated field handing over a complete internal
        # address on the first request contradicted DESIGN.md section 16's
        # difficulty philosophy (reasoning/chaining, not free answers) and
        # section 30's release checklist (hints must not be required).
        # The real discovery path is now the pre-seeded demo import job --
        # see app/seed.py's DEMO_IMPORT_SOURCE and its comment.
        return ServiceStatus(
            api="cloudvault-api v0.4.0 - operational",
            worker="import-worker v0.4.0 - operational",
        )

    @strawberry.field
    def import_job(self, info: Info, id: strawberry.ID) -> Optional[ImportJob]:
        user = _require_user(info)
        db = info.context["db"]
        job = db.query(ImportModel).filter_by(id=str(id)).first()
        if job is None or job.owner_id != user.id:
            # Nullable field -- "not yours" and "doesn't exist" look
            # identical to the caller, same reasoning as _get_owned_import.
            return None
        return ImportJob.from_model(job)


@strawberry.type
class Mutation:
    @strawberry.mutation
    def login(self, username: str, password: str, info: Info) -> AuthPayload:
        db = info.context["db"]
        user = db.query(UserModel).filter_by(username=username).first()
        if user is None or not verify_password(password, user.password_hash):
            raise Exception("Invalid credentials")

        role = user.role.value if hasattr(user.role, "value") else user.role
        token = create_access_token(user.id, user.username, role)
        return AuthPayload(token=token, user=User.from_model(user))

    @strawberry.mutation
    def create_import(self, input: ImportInput, info: Info) -> ImportJob:
        user = _require_user(info)
        db = info.context["db"]

        try:
            normalized = validate_source(input.source)
        except SourceValidationError as exc:
            raise Exception(str(exc)) from exc

        method = _validate_method(input.method)
        serialized_headers = _serialize_headers(input.headers)

        job = ImportModel(
            owner_id=user.id,
            source=normalized,
            validated_source=normalized,
            format=input.format,
            method=method,
            body=input.body,
            headers=serialized_headers,
            status=ImportStatus.VALIDATED,
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return ImportJob.from_model(job)

    @strawberry.mutation
    def update_import(self, id: strawberry.ID, input: ImportUpdateInput, info: Info) -> ImportJob:
        user = _require_user(info)
        db = info.context["db"]
        job = _get_owned_import(db, user, str(id))

        if job.status != ImportStatus.VALIDATED:
            raise Exception("Import cannot be updated in its current state.")

        if input.source is not None:
            try:
                normalized = validate_source(input.source)
            except SourceValidationError as exc:
                raise Exception(str(exc)) from exc

            job.source = normalized
            # VULNERABLE (DESIGN.md V1, Phase 5): validated_source is
            # deliberately NOT re-synced here. `normalized` still passed
            # validate_source()'s basic scheme/hostname check -- this is
            # not a validation bypass -- but the SNAPSHOT that
            # executeImport trusts as "the source that was validated"
            # goes stale the moment source changes. status is still set
            # to VALIDATED because, from this resolver's own (flawed)
            # point of view, nothing here looks wrong.
            job.status = ImportStatus.VALIDATED

        # Phase 8: method/body/headers are NOT part of the V1 invariant --
        # there was never a "validated" concept for them, so there's no
        # staleness to introduce. Updated directly, independent of source.
        if input.method is not None:
            job.method = _validate_method(input.method)
        if input.body is not None:
            job.body = input.body
        if input.headers is not None:
            job.headers = _serialize_headers(input.headers)

        db.commit()
        db.refresh(job)
        return ImportJob.from_model(job)

    @strawberry.mutation
    def execute_import(self, id: strawberry.ID, info: Info) -> ImportJob:
        user = _require_user(info)
        db = info.context["db"]
        job = _get_owned_import(db, user, str(id))

        if job.status != ImportStatus.VALIDATED:
            raise Exception("Import is not ready to execute.")

        # VULNERABLE (DESIGN.md V1, Phase 5): this resolver trusts
        # job.status == VALIDATED alone as authorization to fetch
        # job.source. It does NOT check job.source against
        # job.validated_source -- that comparison used to live here as a
        # dormant safeguard, but keeping it would have made the TOCTOU
        # flaw in update_import unexploitable (the divergent state would
        # be correctly caught and blocked here instead). Removing it is
        # the other half of V1, not an unrelated change: the bug is
        # specifically that NEITHER resolver re-confirms the source that
        # is actually about to be fetched.
        job.status = ImportStatus.RUNNING
        job.worker_id = "import-worker-1"
        db.commit()

        # Phase 8: deserialize the stored headers JSON back into a plain
        # dict for the worker call. method/body/headers are NOT part of
        # the V1 invariant above -- see model/resolver comments elsewhere.
        headers_dict = {}
        if job.headers:
            for pair in json.loads(job.headers):
                headers_dict[pair["name"]] = pair["value"]

        # Boundary 2 (DESIGN.md): the worker, not this API, performs the
        # actual network fetch. Whatever it returns becomes visible to the
        # player via ImportJob.result -- this is the intended channel for
        # surfacing fetched content later in the chain.
        try:
            result = request_fetch(job.source, method=job.method, body=job.body, headers=headers_dict)
        except WorkerCallError as exc:
            job.status = ImportStatus.FAILED
            job.result = str(exc)
            db.commit()
            db.refresh(job)
            return ImportJob.from_model(job)

        if result.get("ok"):
            job.status = ImportStatus.COMPLETED
            job.result = result.get("body")
        else:
            job.status = ImportStatus.FAILED
            job.result = result.get("error")

        db.commit()
        db.refresh(job)
        return ImportJob.from_model(job)

    @strawberry.mutation
    def cancel_import(self, id: strawberry.ID, info: Info) -> bool:
        user = _require_user(info)
        db = info.context["db"]
        job = _get_owned_import(db, user, str(id))

        if job.status in TERMINAL_STATUSES:
            raise Exception("Import is already finished.")

        job.status = ImportStatus.CANCELLED
        db.commit()
        return True


schema = strawberry.Schema(query=Query, mutation=Mutation)
