"""
Phase 7: unit tests for sample-library.

Confirms the redirector's one and only behavior -- a fixed 302 to
metadata-service's identity endpoint, regardless of any query string the
caller supplies. This is the test that would fail if this service were
ever "improved" into an open redirect.
"""

from fastapi.testclient import TestClient

from app.main import METADATA_IDENTITY_URL, app

client = TestClient(app)


def test_sample_pdf_redirects_to_metadata_identity():
    resp = client.get("/library/sample.pdf", follow_redirects=False)
    assert resp.status_code == 302
    assert resp.headers["location"] == METADATA_IDENTITY_URL


def test_query_parameters_are_ignored():
    resp = client.get(
        "/library/sample.pdf?target=http://evil.example.com",
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == METADATA_IDENTITY_URL


def test_healthz():
    resp = client.get("/healthz")
    assert resp.status_code == 200
