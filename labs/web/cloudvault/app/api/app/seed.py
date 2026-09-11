import os
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from app.db.models import Base, User, Import, Role, ImportStatus
from app.auth import hash_password

SEED_PLAYER_USERNAME = os.environ.get("SEED_PLAYER_USERNAME", "player")
SEED_PLAYER_PASSWORD = os.environ.get("SEED_PLAYER_PASSWORD", "changeme123")
PLAYER_USERNAME = SEED_PLAYER_USERNAME  # alias for tests
DEMO_IMPORT_SOURCE = "http://sample-library:9200/library/sample.pdf"
DEMO_VAULT_IMPORT_SOURCE = "http://internal-vault-api:9300/vault/entries"
DEMO_ASSUME_WORKER_SOURCE = "http://internal-vault-api:9300/vault/assume-worker"

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:////srv/data/cloudvault.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def seed() -> None:
    init_db()
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(username=SEED_PLAYER_USERNAME).first()
        if existing:
            print(f"[seed] user '{SEED_PLAYER_USERNAME}' already exists, skipping")
            return

        user = User(
            username=SEED_PLAYER_USERNAME,
            password_hash=hash_password(SEED_PLAYER_PASSWORD),
            role=Role.PLAYER,
            organization_id="cloudvault-default-org",
        )
        db.add(user)
        db.commit()
        print(f"[seed] created player account '{SEED_PLAYER_USERNAME}'")

        demo_job = Import(
            owner_id=user.id,
            source=DEMO_IMPORT_SOURCE,
            validated_source=DEMO_IMPORT_SOURCE,
            format=None,
            status=ImportStatus.VALIDATED,
        )
        db.add(demo_job)

        vault_job = Import(
            owner_id=user.id,
            source=DEMO_VAULT_IMPORT_SOURCE,
            validated_source=DEMO_VAULT_IMPORT_SOURCE,
            format=None,
            status=ImportStatus.VALIDATED,
        )
        db.add(vault_job)

        assume_job = Import(
            owner_id=user.id,
            source=DEMO_ASSUME_WORKER_SOURCE,
            validated_source=DEMO_ASSUME_WORKER_SOURCE,
            method="POST",
            format=None,
            status=ImportStatus.VALIDATED,
        )
        db.add(assume_job)
        db.commit()
        print(f"[seed] created demo import jobs for '{SEED_PLAYER_USERNAME}'")
    except Exception as e:
        print(f"[seed] ERROR: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
