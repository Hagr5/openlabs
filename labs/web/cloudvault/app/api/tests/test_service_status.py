"""
Phase 7 (revised): serviceStatus must stay a genuinely boring distractor.

Originally this field leaked the sample-library URL directly, unauthenticated
-- reviewed and rejected as too easy a recon path for an Expert-tier
challenge (see schema.py's service_status comment for the full reasoning).
The real discovery mechanism is now the pre-seeded demo import job
(app/seed.py's DEMO_IMPORT_SOURCE), found via the ordinary `jobs` query.

This test's job is now the OPPOSITE of before: prove the leak stays gone,
not that it exists. A future "helpful" edit adding diagnostic detail back
into this field is exactly the regression this guards against.
"""

from conftest import gql


def test_service_status_contains_no_internal_hostnames_or_urls(client):
    result = gql(client, "{ serviceStatus { api worker } }")
    status = result["data"]["serviceStatus"]

    assert "cloudvault-api" in status["api"]
    for leaked_term in ("sample-library", "metadata-service", "internal-vault-api", "http://", "https://"):
        assert leaked_term not in status["api"]
        assert leaked_term not in status["worker"]


def test_service_status_does_not_require_auth(client):
    # Still legitimately public -- just contentless. Unauthenticated access
    # is fine when there's nothing sensitive to protect.
    resp = client.post("/graphql", json={"query": "{ serviceStatus { api worker } }"})
    assert resp.status_code == 200
    assert resp.json()["data"]["serviceStatus"] is not None
