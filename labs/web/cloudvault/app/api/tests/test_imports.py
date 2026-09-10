"""
Phase 3 Step 3 tests: safe-baseline import lifecycle + object-level
authorization (IDOR prevention).

Deliberately does NOT test any TOCTOU behavior -- that flaw doesn't exist
in this phase's code. This file locks in the SAFE version so Phase 5's
one-line change has an obvious diff and a test that will start failing
the moment the flaw is introduced (useful as a "did I actually introduce
it" sanity check, then it gets deliberately removed/adjusted in Phase 5).
"""

from conftest import gql

SAFE_SOURCE = "https://example.com/report.pdf"
SAFE_SOURCE_2 = "https://example.org/other-report.pdf"
BLOCKED_SOURCE = "http://localhost/secret"


def test_create_import_validates_and_sets_validated_status(client, make_user, auth_header):
    user = make_user("alice")
    headers = auth_header(user)

    result = gql(client, """
        mutation($source: String!) {
          createImport(input: { source: $source }) {
            id
            source
            status
          }
        }
    """, headers=headers, variables={"source": SAFE_SOURCE})

    job = result["data"]["createImport"]
    assert job["source"] == SAFE_SOURCE
    assert job["status"] == "validated"


def test_create_import_rejects_blocked_source(client, make_user, auth_header):
    user = make_user("bob")
    headers = auth_header(user)

    result = gql(client, """
        mutation($source: String!) {
          createImport(input: { source: $source }) { id }
        }
    """, headers=headers, variables={"source": BLOCKED_SOURCE})

    assert result.get("errors"), "blocked source should have been rejected"


def test_update_import_accepts_valid_source_but_does_not_revalidate(client, make_user, auth_header):
    """
    RENAMED from test_..._revalidates_... (Phase 5): that name asserted a
    security property (revalidation happens on update) which is no longer
    true, and is INTENTIONALLY no longer true -- see DESIGN.md V1/V2.

    This test now proves the actual, current behavior: updateImport
    accepts a new, independently-valid source (validate_source() still
    ran and would have rejected garbage), the GraphQL response still
    looks completely normal, status still reads "validated" -- but the DB
    row itself now holds source != validated_source. Checking the DB
    directly matters here because NOTHING in the GraphQL schema exposes
    validated_source to a caller -- the divergence is real but invisible
    at the API surface, which is exactly the TOCTOU condition.

    See test_toctou_source_divergence.py for the test that proves this
    divergence is actually EXPLOITABLE (i.e. executeImport fetches the
    unrevalidated value), not just present in the database.
    """
    from app.db.models import Import as ImportModel
    from app.db.session import SessionLocal

    user = make_user("carol")
    headers = auth_header(user)

    created = gql(client, """
        mutation($source: String!) {
          createImport(input: { source: $source }) { id }
        }
    """, headers=headers, variables={"source": SAFE_SOURCE})
    job_id = created["data"]["createImport"]["id"]

    updated = gql(client, """
        mutation($id: ID!, $source: String) {
          updateImport(id: $id, input: { source: $source }) {
            id
            source
            status
          }
        }
    """, headers=headers, variables={"id": job_id, "source": SAFE_SOURCE_2})
    assert updated["data"]["updateImport"]["source"] == SAFE_SOURCE_2
    assert updated["data"]["updateImport"]["status"] == "validated"

    # The GraphQL response alone looks completely normal -- this is the
    # DB-level check that proves the staleness actually exists underneath.
    db = SessionLocal()
    try:
        row = db.query(ImportModel).filter_by(id=job_id).first()
        assert row.source == SAFE_SOURCE_2
        assert row.validated_source == SAFE_SOURCE
        assert row.source != row.validated_source
        assert row.status.value == "validated"
    finally:
        db.close()


def test_owner_cannot_see_or_mutate_another_users_import(client, make_user, auth_header):
    owner = make_user("dave")
    other = make_user("erin")

    created = gql(client, """
        mutation($source: String!) {
          createImport(input: { source: $source }) { id }
        }
    """, headers=auth_header(owner), variables={"source": SAFE_SOURCE})
    job_id = created["data"]["createImport"]["id"]

    leaked = gql(client, """
        query($id: ID!) { importJob(id: $id) { id } }
    """, headers=auth_header(other), variables={"id": job_id})
    assert leaked["data"]["importJob"] is None

    others_jobs = gql(client, "{ jobs { id } }", headers=auth_header(other))
    assert job_id not in [j["id"] for j in others_jobs["data"]["jobs"]]

    owners_jobs = gql(client, "{ jobs { id } }", headers=auth_header(owner))
    assert job_id in [j["id"] for j in owners_jobs["data"]["jobs"]]

    upd = gql(client, """
        mutation($id: ID!, $source: String) {
          updateImport(id: $id, input: { source: $source }) { id }
        }
    """, headers=auth_header(other), variables={"id": job_id, "source": SAFE_SOURCE_2})
    assert upd.get("errors"), "non-owner update should be rejected"

    exe = gql(client, """
        mutation($id: ID!) { executeImport(id: $id) { id } }
    """, headers=auth_header(other), variables={"id": job_id})
    assert exe.get("errors"), "non-owner execute should be rejected"

    can = gql(client, """
        mutation($id: ID!) { cancelImport(id: $id) }
    """, headers=auth_header(other), variables={"id": job_id})
    assert can.get("errors"), "non-owner cancel should be rejected"


def test_execute_requires_validated_state(client, make_user, auth_header):
    user = make_user("frank")
    headers = auth_header(user)

    created = gql(client, """
        mutation($source: String!) {
          createImport(input: { source: $source }) { id }
        }
    """, headers=headers, variables={"source": SAFE_SOURCE})
    job_id = created["data"]["createImport"]["id"]

    gql(client, "mutation($id: ID!) { cancelImport(id: $id) }", headers=headers, variables={"id": job_id})

    exe = gql(client, "mutation($id: ID!) { executeImport(id: $id) { id } }", headers=headers, variables={"id": job_id})
    assert exe.get("errors"), "executing a cancelled job should fail"
