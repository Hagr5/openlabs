"""duck-nest project workspace."""

import hashlib
import hmac
import json
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

PORT = 8378
TOKEN_TTL = 8 * 60 * 60
SIGNER_KEY = "nest-signer-lab-secret"

DATA = json.loads(
    (Path(__file__).parent / "data" / "nest.json").read_text(encoding="utf-8")
)

USERS = {u["id"]: u for u in DATA["users"]}
PROJECTS = DATA["projects"]
DOCUMENTS = DATA["documents"]

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>duck nest</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0;
    padding: 3rem 1.5rem;
    background: #1c1916;
    color: #d6cfc7;
    font: 15px/1.6 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  main { max-width: 34rem; margin: 0 auto; }
  h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.25rem; color: #f2ede7; }
  p.sub { margin: 0 0 2rem; color: #8a8078; }
  h2 { font-size: 1rem; font-weight: 600; margin: 2rem 0 0.5rem; color: #f2ede7; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 0.35rem 0; border-bottom: 1px solid #322c26; }
  li:last-child { border-bottom: none; }
  code { background: #14110e; border: 1px solid #322c26; padding: 0.1rem 0.35rem; border-radius: 4px; }
  pre {
    padding: 1rem; background: #14110e;
    border: 1px solid #322c26; color: #e8e2da; overflow-x: auto;
  }
</style>
</head>
<body>
<main>
  <h1>duck nest</h1>
  <p class="sub">internal project workspace</p>
  <p>The nest holds project documents. Each project has an owner. Access
  goes through the API below.</p>

  <h2>Sign in</h2>
  <p>Use the account from the brief, then send the token as a bearer header.</p>
  <pre>curl -s http://localhost:8378/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"intern","password":"marshroad"}'</pre>

  <h2>Endpoints</h2>
  <ul>
    <li><code>POST /api/auth/login</code> — obtain a token</li>
    <li><code>GET /api/users/me</code> — your profile</li>
    <li><code>GET /api/projects</code> — list your projects</li>
    <li><code>GET /api/projects/{id}</code> — project details</li>
    <li><code>GET /api/projects/{id}/documents</code> — documents</li>
    <li><code>GET /api/documents/{id}</code> — document content</li>
  </ul>
</main>
</body>
</html>
"""


def sha256digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def make_token(uid: int) -> str:
    payload = json.dumps({"uid": uid, "exp": int(time.time()) + TOKEN_TTL})
    sig = hmac.new(SIGNER_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return payload + "." + sig


def parse_token(token: str) -> int | None:
    try:
        payload, sig = token.split(".", 1)
        expected = hmac.new(
            SIGNER_KEY.encode(), payload.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return None
        data = json.loads(payload)
        if int(data["exp"]) < int(time.time()):
            return None
        return int(data["uid"])
    except (ValueError, KeyError, TypeError):
        return None


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "full_name": user["full_name"],
    }


def public_project(project: dict) -> dict:
    return {
        "id": project["id"],
        "name": project["name"],
        "description": project["description"],
        "owner_id": project["owner_id"],
    }


def public_doc_index(document: dict) -> dict:
    return {
        "id": document["id"],
        "project_id": document["project_id"],
        "title": document["title"],
    }


def public_doc(document: dict) -> dict:
    return {
        "id": document["id"],
        "project_id": document["project_id"],
        "title": document["title"],
        "content": document["content"],
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, obj) -> None:
        self._send(status, json.dumps(obj).encode("utf-8"), "application/json; charset=utf-8")

    def _read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return {}
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}

    def _authed_user(self):
        header = self.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return None
        uid = parse_token(token)
        if uid is None:
            return None
        return USERS.get(uid)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ("/", "/index.html"):
            self._send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
            return

        user = self._authed_user()
        if user is None:
            self._json(401, {"error": "authentication required"})
            return

        if path == "/api/users/me":
            self._json(200, public_user(user))
            return

        match = re.fullmatch(r"/api/users/(\d+)", path)
        if match:
            target = USERS.get(int(match.group(1)))
            if user["role"] != "admin":
                self._json(403, {"error": "forbidden"})
                return
            if target is None:
                self._json(404, {"error": "not found"})
                return
            self._json(200, public_user(target))
            return

        if path == "/api/projects":
            mine = [public_project(p) for p in PROJECTS if p["owner_id"] == user["id"]]
            self._json(200, {"count": len(mine), "projects": mine})
            return

        match = re.fullmatch(r"/api/projects/(\d+)/documents", path)
        if match:
            pid = int(match.group(1))
            project = next((p for p in PROJECTS if p["id"] == pid), None)
            if project is None:
                self._json(404, {"error": "not found"})
                return
            docs = [public_doc_index(d) for d in DOCUMENTS if d["project_id"] == pid]
            self._json(200, {"project_id": pid, "count": len(docs), "documents": docs})
            return

        match = re.fullmatch(r"/api/projects/(\d+)", path)
        if match:
            pid = int(match.group(1))
            project = next((p for p in PROJECTS if p["id"] == pid), None)
            if project is None:
                self._json(404, {"error": "not found"})
                return
            self._json(200, public_project(project))
            return

        match = re.fullmatch(r"/api/documents/(\d+)", path)
        if match:
            did = int(match.group(1))
            document = next((d for d in DOCUMENTS if d["id"] == did), None)
            if document is None:
                self._json(404, {"error": "not found"})
                return
            self._json(200, public_doc(document))
            return

        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path != "/api/auth/login":
            self._json(404, {"error": "not found"})
            return

        data = self._read_json()
        username = str(data.get("username", ""))
        password = str(data.get("password", ""))
        user = next((u for u in USERS.values() if u["username"] == username), None)
        if user is None or not hmac.compare_digest(sha256digest(password), user["password_hash"]):
            self._json(401, {"error": "invalid credentials"})
            return

        self._json(
            200,
            {"token": make_token(user["id"]), "user": public_user(user)},
        )

    def log_message(self, format: str, *args) -> None:
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"duck nest listening on {PORT}")
    server.serve_forever()