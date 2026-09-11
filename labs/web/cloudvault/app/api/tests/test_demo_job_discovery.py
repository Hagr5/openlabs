"""
Phase 7 (revised): demo-job discovery mechanism.

Split deliberately into two tests with two different, non-overlapping
claims -- conflating them was the exact mistake in the version this file
replaces.

RESOLVER-LEVEL (this file, this test): proves the `jobs` query correctly
returns an import that already exists and belongs to the caller. This is
a property of the resolver/authorization logic, independent of anything
seed.py does.

SEED-LEVEL (NOT here): proving that `app.seed.seed()` actually creates
exactly one demo job for SEED_PLAYER_USERNAME, idempotently, on a real
run, requires invoking seed.py itself against a test database and
inspecting the result -- that exercises startup/env-var wiring this
test file's fixtures deliberately don't set up (conftest.py's isolated
per-session DB is not the same thing as a fresh `docker compose up`
seed run). That belongs in Phase 10's full-stack testing, per
DESIGN.md's phased roadmap, same reasoning already used to defer
real-worker-container tests there. Until Phase 10, seed.py's actual
behavior is verified manually (see PRIVATE_SOLUTION.md's Phase 7
verification log for the live `docker compose up` + curl proof).
"""

from conftest import gql

SAMPLE_LIBRARY_URL = "http://sample-library:9200/library/sample.pdf"


def test_owner_can_discover_a_preexisting_import_via_jobs(client, make_user, auth_header):
    """
    Resolver-level only. Simulates "this account already has an import
    before the player did anything" by inserting one directly via the DB
    layer -- this does NOT claim to test seed.py, only that `jobs`
    correctly surfaces an existing owned import with the exact shape the
    real demo job has (VALIDATED, source == validated_source, not yet
    executed).
    """
    from app.db.models import Import as ImportModel, ImportStatus
    from app.db.session import SessionLocal

    user = make_user("preexisting_job_owner")

    db = SessionLocal()
    try:
        preexisting = ImportModel(
            owner_id=user.id,
            source=SAMPLE_LIBRARY_URL,
            validated_source=SAMPLE_LIBRARY_URL,
            format=None,
            status=ImportStatus.VALIDATED,
        )
        db.add(preexisting)
        db.commit()
    finally:
        db.close()

    result = gql(client, "{ jobs { id source status } }", headers=auth_header(user))
    jobs = result["data"]["jobs"]

    assert len(jobs) == 1
    assert jobs[0]["source"] == SAMPLE_LIBRARY_URL
    assert jobs[0]["status"] == "validated"
