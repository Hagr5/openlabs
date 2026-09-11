"""
Phase 7: unit tests for import-worker's /internal/fetch validation
boundary.

Confirms the two properties the redirect bypass depends on:

  1. A literal metadata-service or internal-vault-api URL is rejected by
     Layer 2 validation BEFORE any network call is attempted.
  2. A sample-library URL passes Layer 2 validation (deliberately not
     blocklisted), and the worker uses follow_redirects=True when it
     actually fetches.

No real network call happens anywhere in this file -- httpx.Client is
mocked. The real cross-container redirect chain (sample-library ->
metadata-service) is verified live against running containers, not here
-- see PRIVATE_SOLUTION.md's Phase 7 verification section.
"""

import os

os.environ.setdefault("WORKER_SHARED_SECRET", "test-secret")

import httpx
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
HEADERS = {"X-Worker-Secret": "test-secret"}


def test_metadata_service_literal_is_rejected_before_any_fetch(monkeypatch):
    def exploding_client(*a, **kw):
        raise AssertionError("must not reach the network -- validation should reject this URL")

    monkeypatch.setattr(httpx, "Client", exploding_client)

    resp = client.post(
        "/internal/fetch",
        json={"url": "http://metadata-service:9100/metadata/identity", "method": "GET"},
        headers=HEADERS,
    )
    assert resp.json()["ok"] is False


def test_internal_vault_api_literal_is_rejected_before_any_fetch(monkeypatch):
    def exploding_client(*a, **kw):
        raise AssertionError("must not reach the network")

    monkeypatch.setattr(httpx, "Client", exploding_client)

    resp = client.post(
        "/internal/fetch",
        json={"url": "http://internal-vault-api:9300/graphql", "method": "GET"},
        headers=HEADERS,
    )
    assert resp.json()["ok"] is False


def test_sample_library_literal_passes_validation_and_uses_follow_redirects(monkeypatch):
    """
    Proves sample-library is NOT blocklisted (Layer 2 lets it through)
    and that the worker's HTTP client is constructed with
    follow_redirects=True -- the exact mechanism DESIGN.md's V3 depends
    on. Still fully mocked; no real network call.
    """
    captured = {}

    class FakeResponse:
        status_code = 200
        text = "fake response body, network never touched"

    class FakeClient:
        def __init__(self, *a, **kw):
            captured["init_kwargs"] = kw

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def request(self, method, url, **kw):
            captured["method"] = method
            captured["url"] = url
            return FakeResponse()

    monkeypatch.setattr(httpx, "Client", FakeClient)

    resp = client.post(
        "/internal/fetch",
        json={"url": "http://sample-library:9200/library/sample.pdf", "method": "GET"},
        headers=HEADERS,
    )

    body = resp.json()
    assert body["ok"] is True
    assert captured["url"] == "http://sample-library:9200/library/sample.pdf"
    assert captured["init_kwargs"]["follow_redirects"] is True
