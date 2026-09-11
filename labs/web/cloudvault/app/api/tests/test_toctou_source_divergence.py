"""
Phase 5: regression test proving the TOCTOU vulnerability (DESIGN.md
V1/V2) is actually exploitable, not merely present as a DB-level state
divergence.

test_imports.py's test_update_import_accepts_valid_source_but_does_not_revalidate
proves source != validated_source can exist in the database. This file
proves the consequence: executeImport fetches the NEW, never-revalidated
source, using only status == VALIDATED as its authorization -- exactly
the attack DESIGN.md describes as the intended Phase 5/6 trigger for
reaching the SSRF worker with a source the API itself never actually
re-checked.

Still fully isolated -- request_fetch is mocked, no real worker or
network call happens here. What we're proving is CLOUDVAULT-API'S OWN
LOGIC: which URL it hands to the worker.
"""

from conftest import gql

ORIGINAL_SOURCE = "https://example.com/original-report.pdf"
SWAPPED_SOURCE = "https://example.org/swapped-after-validation.pdf"


def test_execute_import_fetches_unrevalidated_source_after_update(client, make_user, auth_header, monkeypatch):
    """
    The core exploit proof:
      1. createImport(ORIGINAL_SOURCE)   -> source == validated_source == ORIGINAL_SOURCE
      2. updateImport(SWAPPED_SOURCE)    -> source == SWAPPED_SOURCE, validated_source STILL ORIGINAL_SOURCE
      3. executeImport()                 -> must actually request SWAPPED_SOURCE

    If step 3 requested ORIGINAL_SOURCE instead, or refused to run, the
    vulnerability would not be exploitable regardless of what the
    database contains. This assertion is the one that matters most.
    """
    user = make_user("judy")
    headers = auth_header(user)

    created = gql(client, """
        mutation($source: String!) {
          createImport(input: { source: $source }) { id source status }
        }
    """, headers=headers, variables={"source": ORIGINAL_SOURCE})
    job_id = created["data"]["createImport"]["id"]
    assert created["data"]["createImport"]["source"] == ORIGINAL_SOURCE
    assert created["data"]["createImport"]["status"] == "validated"

    updated = gql(client, """
        mutation($id: ID!, $source: String) {
          updateImport(id: $id, input: { source: $source }) { id source status }
        }
    """, headers=headers, variables={"id": job_id, "source": SWAPPED_SOURCE})
    assert updated["data"]["updateImport"]["source"] == SWAPPED_SOURCE
    assert updated["data"]["updateImport"]["status"] == "validated"

    # Capture exactly what URL executeImport actually asks the worker to fetch.
    captured_urls = []

    def spy_fetch(url, method="GET", body=None, headers=None):
        captured_urls.append(url)
        return {"ok": True, "status_code": 200, "body": "attacker-controlled-response"}

    monkeypatch.setattr("app.schema.request_fetch", spy_fetch)

    executed = gql(client, """
        mutation($id: ID!) {
          executeImport(id: $id) { id status result }
        }
    """, headers=headers, variables={"id": job_id})

    # THE EXPLOIT: executeImport did not refuse, and it fetched the
    # SWAPPED source -- the one that was never independently re-validated
    # -- not the ORIGINAL source that createImport actually checked.
    assert captured_urls == [SWAPPED_SOURCE]
    assert executed["data"]["executeImport"]["status"] == "completed"
    assert executed["data"]["executeImport"]["result"] == "attacker-controlled-response"


def test_execute_import_without_update_still_fetches_original_source(client, make_user, auth_header, monkeypatch):
    """
    Control case: if a player never calls updateImport at all, source and
    validated_source are still equal, and executeImport should behave
    identically to before -- fetching the one and only source that was
    ever actually validated. This isn't a security check (there's no
    longer a comparison in execute_import to test) -- it just confirms
    the safe, non-exploited path still works normally and that the
    vulnerability requires the update step, not just any execute call.
    """
    user = make_user("kevin")
    headers = auth_header(user)

    created = gql(client, """
        mutation($source: String!) {
          createImport(input: { source: $source }) { id }
        }
    """, headers=headers, variables={"source": ORIGINAL_SOURCE})
    job_id = created["data"]["createImport"]["id"]

    captured_urls = []

    def spy_fetch(url, method="GET", body=None, headers=None):
        captured_urls.append(url)
        return {"ok": True, "status_code": 200, "body": "normal-response"}

    monkeypatch.setattr("app.schema.request_fetch", spy_fetch)

    executed = gql(client, """
        mutation($id: ID!) {
          executeImport(id: $id) { id status }
        }
    """, headers=headers, variables={"id": job_id})

    assert captured_urls == [ORIGINAL_SOURCE]
    assert executed["data"]["executeImport"]["status"] == "completed"
