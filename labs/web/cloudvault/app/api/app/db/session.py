"""
Engine/session wiring for cloudvault-api.

DATABASE_URL is read from the environment so docker-compose can point this
at either SQLite (dev/simple deploy) or Postgres (realism) without code
changes. Defaults to a local SQLite file so `python -m app.seed` works
standalone for quick iteration outside Docker too.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./cloudvault.db")

# check_same_thread=False is only needed for SQLite; harmless to set
# conditionally so this file works unmodified against Postgres later.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
