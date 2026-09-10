"""
Database models for cloudvault-api.

These match DESIGN.md section 8 exactly. A few notes for future phases,
so nothing here is a surprise later:

- `Import.source` and `Import.validated_source` are SEPARATE columns, and as
  of Phase 5 the TOCTOU flaw (V1) is live: updateImport() changes `source`
  without touching `validated_source`. Keeping these as two independent
  columns from day one meant the vulnerability stayed a pure
  application-logic bug rather than something a DB-level default/trigger
  could accidentally "fix" behind the scenes.

- `Token` and `VaultEntry` are unused by cloudvault-api itself. They live here
  because this file mirrors the single logical data model described in
  DESIGN.md, but in the real deployment `tokens` and `vault_entries` will be
  owned by internal-vault-api's own database, NOT this one. cloudvault-api
  must never be able to query them directly -- that would collapse boundary 4
  and 5 into nothing. Keep this in mind for Phase 8: internal-vault-api gets
  ITS OWN db.py, not an import of this file.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def _uuid() -> str:
    return str(uuid.uuid4())


class Role(str, enum.Enum):
    PLAYER = "player"
    ADMIN = "admin"  # exists for realism / future distractor use; not used by the
    # intended solve path. See DESIGN.md section 17 (Controlled Distractors).


class ImportStatus(str, enum.Enum):
    QUEUED = "queued"
    VALIDATED = "validated"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(Role), nullable=False, default=Role.PLAYER)
    organization_id = Column(String, nullable=False, default="cloudvault-default-org")

    imports = relationship("Import", back_populates="owner")


class Import(Base):
    __tablename__ = "imports"

    id = Column(String, primary_key=True, default=_uuid)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)

    source = Column(String, nullable=False)
    # Snapshot of the source at the moment it was last validated.
    # THE SECURITY INVARIANT (see DESIGN.md V1): executeImport() must only
    # trust `status == VALIDATED` if `source == validated_source`. Nothing
    # in this model enforces that -- it is an application-layer decision by
    # design, so it can be gotten wrong by design.
    validated_source = Column(String, nullable=False)

    format = Column(String, nullable=True)
    status = Column(Enum(ImportStatus), nullable=False, default=ImportStatus.QUEUED)
    result = Column(Text, nullable=True)
    worker_id = Column(String, nullable=True)

    # Phase 8: needed so the worker can make an authenticated request to
    # internal-vault-api (Authorization header, POST body for assumeWorker).
    # NOT covered by the V1 invariant above -- there is no "validated"
    # concept for these fields, they were never checked in the first place,
    # so there is no staleness for them to develop. Write-only from the
    # player's perspective: not exposed on the ImportJob GraphQL type.
    method = Column(String, nullable=False, default="GET")
    body = Column(Text, nullable=True)
    headers = Column(Text, nullable=True)  # JSON-serialized list of {name, value}

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="imports")


class Token(Base):
    """
    NOTE: lives in internal-vault-api's own database in the real deployment
    (see module docstring). Included here only as a shared reference model
    while we're still in the design/skeleton phase.
    """

    __tablename__ = "tokens"

    id = Column(String, primary_key=True, default=_uuid)
    token_hash = Column(String, nullable=False, unique=True)
    role = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=True)


class VaultEntry(Base):
    """See note on Token above -- belongs to internal-vault-api's database."""

    __tablename__ = "vault_entries"

    id = Column(String, primary_key=True, default=_uuid)
    name = Column(String, nullable=False)
    value = Column(String, nullable=False)
    required_role = Column(String, nullable=False, default="cloudvault-import-worker")
