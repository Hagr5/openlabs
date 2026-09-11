"""
Phase 7 (revised): proves the seeded player account actually receives the
demo import job, and that it's genuinely discoverable/executable the same
way any player-created job would be -- since this is now the ONLY
discovery path for sample-library (serviceStatus no longer leaks it).

Calls app.seed.seed() directly against the test database. This is the
first test in the suite to do so -- everything else uses make_user(),
which bypasses seed() entirely, so this is also the first real exercise
of seed.py's actual logic (not just the fixture that stands in for it).
"""

from app.auth import create_access_token
from app.db.models import User
from app.db.session import SessionLocal
from app.seed import DEMO_IMPORT_SOURCE, PLAYER_USERNAME, seed
from conftest import gql


def test_seed_creates_demo_import_for_player(client):
    seed()  # idempotent -- safe even if the session-scoped DB already has this user

    db = SessionLocal()
    try:
        user = db.query(User).filter_by(username=PLAYER_USERNAME).first()
        assert user is not None
    finally:
        db.close()

    token = create_access_token(user.id, user.username, user.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    result = gql(client, "{ jobs { id source status } }", headers=headers)
    jobs = result["data"]["jobs"]

    demo_jobs = [j for j in jobs if j["source"] == DEMO_IMPORT_SOURCE]
    assert len(demo_jobs) == 1, "expected exactly one pre-seeded demo import job"
    assert demo_jobs[0]["status"] == "validated"


def test_seed_demo_import_is_executable_like_any_other_job(client, monkeypatch):
    """
    Confirms the demo job isn't special-cased anywhere -- it goes through
    the exact same executeImport path as a player-created job, mocked
    worker call included. This is what actually proves it's a legitimate
    discovery path and not just an inert decoration.
    """
    seed()

    db = SessionLocal()
    try:
        user = db.query(User).filter_by(username=PLAYER_USERNAME).first()
    finally:
        db.close()

    token = create_access_token(user.id, user.username, user.role.value)
    headers = {"Authorization": f"Bearer {token}"}

    jobs = gql(client, "{ jobs { id source } }", headers=headers)["data"]["jobs"]
    demo_job_id = next(j["id"] for j in jobs if j["source"] == DEMO_IMPORT_SOURCE)

    captured_urls = []

    def spy_fetch(url, method="GET", body=None, headers=None):
        captured_urls.append(url)
        return {"ok": True, "status_code": 200, "body": "sample-library-response"}

    monkeypatch.setattr("app.schema.request_fetch", spy_fetch)

    result = gql(client, f'mutation {{ executeImport(id: "{demo_job_id}") {{ status result }} }}', headers=headers)

    assert captured_urls == [DEMO_IMPORT_SOURCE]
    assert result["data"]["executeImport"]["status"] == "completed"


def test_seed_is_idempotent_for_demo_import(client):
    """
    Closes a real gap: the other two tests in this file call seed() once
    and trust the early-return-on-existing-user logic to prevent
    duplicates, by reading the code rather than proving it. This test
    calls seed() twice and asserts the demo job count for the player
    stays at exactly one -- required by DESIGN.md section 21 and
    explicitly listed in the Phase 7 regression checklist.
    """
    seed()
    seed()  # second call must be a no-op for an already-seeded account

    db = SessionLocal()
    try:
        from app.db.models import Import as ImportModel

        user = db.query(User).filter_by(username=PLAYER_USERNAME).first()
        assert user is not None

        demo_jobs = (
            db.query(ImportModel)
            .filter_by(owner_id=user.id, source=DEMO_IMPORT_SOURCE)
            .all()
        )
        assert len(demo_jobs) == 1, "seed() must not create a duplicate demo job on re-run"
    finally:
        db.close()
