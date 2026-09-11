# cloudvault remediation

## V1 - TOCTOU in validation state

Problem: executeImport fetches job.source without re-checking it against validated_source. updateImport re-validates the new URL but does not re-sync validated_source.

Fix: in updateImport, set validated_source to the new source after successful validation. In executeImport, refuse to run unless source equals validated_source.

Regression test: test_imports.py::test_update_import_accepts_valid_source_but_does_not_revalidate and test_toctou_source_divergence.py.

## V2 - SSRF

Problem: the worker fetches any URL the player supplies.

Fix: resolve the URL and check the resolved IP against a blocklist before connecting. Pin the connection to the resolved IP. Prefer an allowlist of permitted hosts over a denylist.

Regression test: worker/tests/test_fetch_validation.py.

## V3 - Redirect bypass

Problem: validate_source only inspects the initial URL. The worker uses follow_redirects=True and does not re-validate the destination.

Fix: disable automatic redirect following. Handle redirects manually and call validate_source on every hop.

Regression test: worker/tests/test_fetch_validation.py::test_sample_library_literal_passes_validation_and_uses_follow_redirects. Replace this test with one that asserts redirects are refused once the fix is applied.

## V4 - Trust-by-network-location

Problem: metadata-service answers any caller on the internal network without authentication.

Fix: require a shared secret or mTLS on metadata-service. Do not treat network origin as proof of identity.

Regression test: add a test that unauthenticated callers receive 401.

## V5 - Valid Bearer authentication

This check is correct. It is listed because it is a required link in the chain, not because it needs changing.

## V6 - Client-controlled role escalation

Problem: assume_worker trusts the role string in the request body instead of binding it to the role encoded in the authenticated token.

Fix: derive the session role from WORKER_ROLE, not from the request body. Ignore or reject any client-supplied role.

Regression test: internal-vault-api/tests/test_vault.py::test_v6_same_valid_token_escalated_role_reaches_the_flag will need its expectation flipped once the fix lands.

## Session signing (already applied)

The vault session token is HMAC-SHA256 signed. Only assume_worker can issue a valid session. Forged or tampered sessions are rejected.

Regression test: internal-vault-api/tests/test_vault.py::test_forged_session_without_valid_signature_is_rejected.

## Applying the fixes

Each fix is isolated to one service. Applying V1, V3, V4, and V6 together closes the entire chain. Run the test suites in each service directory to confirm.
