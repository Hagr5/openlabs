"""
InvoicePortal - "Someone Else's Bill"
Intended vulnerability chain:
  1) Weak/crackable HS256 JWT signing secret (offline crack with a small wordlist)
  2) Forge a JWT with another user's `sub` claim
  3) /api/invoices and /api/invoices/{id} trust the `sub` claim blindly
     (no ownership check against the authenticated principal), i.e. classic
     BOLA / IDOR once authentication itself has been broken.

This file is intentionally vulnerable for CTF purposes. Do not deploy as-is
outside of an isolated training environment.
"""

import os
import sqlite3
import uuid
import time
import secrets
from flask import Flask, request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash
import jwt  # PyJWT

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DB_PATH = os.environ.get("DB_PATH", "/data/invoiceportal.db")

# INTENTIONALLY WEAK SECRET -- this is the "secondary" vulnerability.
# It must appear in the bundled wordlist.txt so it is crackable offline
# with hashcat -m 16500 or jwt_tool, but should not be so trivial that
# forging becomes easier/faster than the intended BOLA step.
JWT_SECRET = os.environ.get("JWT_SECRET", "changeme2024")
JWT_ALG = "HS256"
JWT_TTL_SECONDS = 60 * 30  # 30 minutes

FLAG = os.environ.get("FLAG", "duck{" + secrets.token_hex(16) + "}")

app = Flask(__name__)


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    fresh = not os.path.exists(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            company_id INTEGER NOT NULL,
            FOREIGN KEY (company_id) REFERENCES companies(id)
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id TEXT PRIMARY KEY,          -- UUID4, not guessable
            owner_id INTEGER NOT NULL,
            company_name TEXT NOT NULL,
            card_last4 TEXT NOT NULL,
            amount_usd REAL NOT NULL,
            notes TEXT NOT NULL,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        );
        """
    )
    conn.commit()

    if fresh:
        seed(conn)

    conn.close()


def seed(conn):
    cur = conn.cursor()

    cur.execute("INSERT INTO companies (name) VALUES (?)", ("Northwind Traders",))
    company_id = cur.lastrowid

    # victim
    cur.execute(
        "INSERT INTO users (username, password_hash, display_name, company_id) "
        "VALUES (?, ?, ?, ?)",
        (
            "victim",
            generate_password_hash("VictimP@ss!2024"),
            "Victim Vance (Accounting)",
            company_id,
        ),
    )
    victim_id = cur.lastrowid

    # attacker (the player's own low-priv account)
    cur.execute(
        "INSERT INTO users (username, password_hash, display_name, company_id) "
        "VALUES (?, ?, ?, ?)",
        (
            "attacker",
            generate_password_hash("attacker_pass123"),
            "Alex Attacker (Support)",
            company_id,
        ),
    )
    attacker_id = cur.lastrowid

    # A decoy/normal invoice for attacker (so the app feels real)
    cur.execute(
        "INSERT INTO invoices (id, owner_id, company_name, card_last4, amount_usd, notes) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            str(uuid.uuid4()),
            attacker_id,
            "Northwind Traders",
            "4242",
            49.99,
            "Monthly subscription - Support tier.",
        ),
    )

    # A couple of decoy invoices for victim (no flag)
    cur.execute(
        "INSERT INTO invoices (id, owner_id, company_name, card_last4, amount_usd, notes) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            str(uuid.uuid4()),
            victim_id,
            "Northwind Traders",
            "1337",
            199.00,
            "Monthly subscription - Accounting tier.",
        ),
    )

    # The invoice that actually holds the flag
    cur.execute(
        "INSERT INTO invoices (id, owner_id, company_name, card_last4, amount_usd, notes) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            str(uuid.uuid4()),
            victim_id,
            "Northwind Traders",
            "9081",
            1499.00,
            f"Annual enterprise renewal - internal audit note: {FLAG}",
        ),
    )

    conn.commit()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def make_token(user_id, email):
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "iat": now,
        "exp": now + JWT_TTL_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token_or_none(token):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


def get_bearer_token():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return auth.split(" ", 1)[1].strip()


def require_auth(f):
    from functools import wraps

    @wraps(f)
    def wrapper(*args, **kwargs):
        token = get_bearer_token()
        if not token:
            return jsonify({"error": "missing bearer token"}), 401
        payload = decode_token_or_none(token)
        if payload is None:
            return jsonify({"error": "invalid or expired token"}), 401
        # NOTE (intentional weakness): we only verify the signature is valid
        # for *some* user id. We do not cross-check this against a live
        # server-side session store, so a forged-but-correctly-signed token
        # is indistinguishable from a legitimate one.
        g.token_sub = payload["sub"]
        return f(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return jsonify({"status": "ok"}), 200


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "")
    password = data.get("password", "")

    db = get_db()
    row = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()

    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid credentials"}), 401

    token = make_token(row["id"], f"{username}@northwind-traders.example")
    return jsonify({"access_token": token, "token_type": "Bearer"}), 200


@app.get("/api/users/me")
@require_auth
def users_me():
    db = get_db()
    row = db.execute(
        "SELECT id, username, display_name, company_id FROM users WHERE id = ?",
        (g.token_sub,),
    ).fetchone()
    if row is None:
        return jsonify({"error": "user not found"}), 404
    return jsonify(dict(row)), 200


@app.get("/api/team/members")
@require_auth
def team_members():
    db = get_db()
    me = db.execute(
        "SELECT company_id FROM users WHERE id = ?", (g.token_sub,)
    ).fetchone()
    if me is None:
        return jsonify({"error": "user not found"}), 404

    rows = db.execute(
        "SELECT id AS user_id, display_name FROM users WHERE company_id = ?",
        (me["company_id"],),
    ).fetchall()
    return jsonify([dict(r) for r in rows]), 200


@app.get("/api/invoices")
@require_auth
def list_invoices():
    # INTENDED VULNERABILITY: trusts g.token_sub completely. If the JWT was
    # forged with someone else's `sub` (using the cracked signing secret),
    # this happily returns *their* invoices.
    db = get_db()
    rows = db.execute(
        "SELECT id, company_name, amount_usd FROM invoices WHERE owner_id = ?",
        (g.token_sub,),
    ).fetchall()
    return jsonify([dict(r) for r in rows]), 200


@app.get("/api/invoices/<invoice_id>")
@require_auth
def invoice_detail(invoice_id):
    # INTENDED VULNERABILITY: same as above -- fetches by primary key only
    # and does not check invoice.owner_id against g.token_sub.
    db = get_db()
    row = db.execute(
        "SELECT id, owner_id, company_name, card_last4, amount_usd, notes "
        "FROM invoices WHERE id = ?",
        (invoice_id,),
    ).fetchone()
    if row is None:
        return jsonify({"error": "invoice not found"}), 404
    return jsonify(dict(row)), 200


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000)
