"""
Phase 4: tests for cloudvault-api's integration with import-worker.

These tests exercise CLOUDVAULT-API'S OWN LOGIC ONLY -- how it reacts to
what request_fetch() returns or raises. They never make a real network
call and never require a running worker container (see conftest.py's
autouse _mock_worker_fetch fixture, which these tests override per-case).

Full end-to-end tests against a REAL worker container belong in Phase 10.
"""

from conftest import gql

SAFE_SOURCE = "https://example.com/report.pdf"


def _create_job(client, headers):
    created = gql(client, """
        mutation($source: String!) {
          createImport(input: { source: $source }) { id }
        }
    """, headers=headers, variables={"source": SAFE_SOURCE})
    return created["data"]["createImport"]["id"]


def test_execute_import_success_stores_worker_result(client, make_user, auth_header, monkeypatch):
    user = make_user("grace")
    headers = auth_header(user)
    job_id = _create_job(client, headers)

    def fake_fetch(url, method="GET", body=None, headers=None):
        assert url == SAFE_SOURCE  # confirms executeImport passes job.source through unchanged
        return {"ok": True, "status_code": 200, "body": "<html>real content</html>"}

    monkeypatch.setattr("app.schema.request_fetch", fake_fetch)

    result = gql(client, """
        mutation($id: ID!) {
          executeImport(id: $id) { id status result workerId }
        }
    """, headers=headers, variables={"id": job_id})

    job = result["data"]["executeImport"]
    assert job["status"] == "completed"
    assert job["result"] == "<html>real content</html>"
    assert job["workerId"] == "import-worker-1"


def test_execute_import_worker_reports_error(client, make_user, auth_header, monkeypatch):
    """
    Simulates the worker's OWN validate_source() rejecting the URL --
    i.e. request_fetch() succeeds as an HTTP call but the JSON body says
    ok=False. cloudvault-api must surface that as a FAILED import, not
    silently treat it as success.
    """
    user = make_user("heidi")
    headers = auth_header(user)
    job_id = _create_job(client, headers)

    def fake_fetch(url, method="GET", body=None, headers=None):
        return {"ok": False, "status_code": None, "body": None, "error": "Source host is not permitted."}

    monkeypatch.setattr("app.schema.request_fetch", fake_fetch)

    result = gql(client, """
        mutation($id: ID!) {
          executeImport(id: $id) { id status result }
        }
    """, headers=headers, variables={"id": job_id})

    job = result["data"]["executeImport"]
    assert job["status"] == "failed"
    assert job["result"] == "Source host is not permitted."


def test_execute_import_worker_unreachable(client, make_user, auth_header, monkeypatch):
    """
    Simulates the worker container itself being down/unreachable --
    request_fetch() raises WorkerCallError rather than returning a dict.
    cloudvault-api must handle this without crashing the GraphQL request.
    """
    from app.worker_client import WorkerCallError

    user = make_user("ivan")
    headers = auth_header(user)
    job_id = _create_job(client, headers)

    def fake_fetch(url, method="GET", body=None, headers=None):
        raise WorkerCallError("Could not reach import-worker: ConnectError")

    monkeypatch.setattr("app.schema.request_fetch", fake_fetch)

    result = gql(client, """
        mutation($id: ID!) {
          executeImport(id: $id) { id status result }
        }
    """, headers=headers, variables={"id": job_id})

    job = result["data"]["executeImport"]
    assert job["status"] == "failed"
    assert "Could not reach import-worker" in job["result"]


def test_worker_client_sends_post_with_body(monkeypatch):
    """
    Unit-level test of app.worker_client.request_fetch itself, not the
    GraphQL layer -- there is currently no GraphQL field exposing
    method/body on an import (ImportInput only has source/format), so
    this is the only way to verify the POST-with-body path works before
    any future phase decides to expose it to the player.

    Mocks httpx.post directly to inspect exactly what payload
    request_fetch builds, without making a real network call.
    """
    import app.worker_client as worker_client

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"ok": True, "status_code": 200, "body": "worker-post-response"}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        return FakeResponse()

    monkeypatch.setattr(worker_client.httpx, "post", fake_post)

    result = worker_client.request_fetch(
        "https://example.com/submit",
        method="POST",
        body="field=value",
    )

    assert captured["json"]["method"] == "POST"
    assert captured["json"]["body"] == "field=value"
    assert captured["json"]["url"] == "https://example.com/submit"
    assert result == {"ok": True, "status_code": 200, "body": "worker-post-response"}


def test_execute_import_passes_custom_headers_to_worker(client, make_user, auth_header, monkeypatch):
    """
    Phase 8: proves a header set via createImport's `headers` input
    actually reaches request_fetch() with the correct name/value -- not
    just that the call doesn't crash (see the signature-only fixes
    applied earlier to unblock this from a TypeError).
    """
    user = make_user("liam")
    headers_gql = auth_header(user)

    created = gql(client, """
        mutation($source: String!, $hdrs: [HeaderInput!]) {
          createImport(input: { source: $source, headers: $hdrs }) { id }
        }
    """, headers=headers_gql, variables={
        "source": SAFE_SOURCE,
        "hdrs": [{"name": "Authorization", "value": "Bearer test-token-xyz"}],
    })
    job_id = created["data"]["createImport"]["id"]

    captured = {}

    def fake_fetch(url, method="GET", body=None, headers=None):
        captured["headers"] = headers
        return {"ok": True, "status_code": 200, "body": "ok"}

    monkeypatch.setattr("app.schema.request_fetch", fake_fetch)

    gql(client, """
        mutation($id: ID!) { executeImport(id: $id) { id status } }
    """, headers=headers_gql, variables={"id": job_id})

    assert captured["headers"] == {"Authorization": "Bearer test-token-xyz"}
