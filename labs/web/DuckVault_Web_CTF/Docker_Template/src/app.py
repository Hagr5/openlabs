import os
import json
import sqlite3
import logging
from functools import wraps

import jwt
from flask import Flask, request, jsonify, render_template
from werkzeug.security import generate_password_hash, check_password_hash


# =============================================================================
# DuckVault — REST API CTF Challenge
#
# Primary vulnerability:
#   BOLA / IDOR in GET /api/documents/<document_id>
#
# Authentication:
#   JWT Bearer tokens
#
# The JWT implementation is intentionally NOT vulnerable.
# The intended weakness is object-level authorization.
# =============================================================================

app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","lvl":"%(levelname)s","msg":"%(message)s"}',
)

log = logging.getLogger("duckvault")


# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

JWT_SECRET = os.environ.get("JWT_SECRET", "duckvault-development-secret")
JWT_ALGORITHM = "HS256"

DB_PATH = os.environ.get(
    "DB_PATH",
    "/tmp/duckvault.db"
)


# -----------------------------------------------------------------------------
# Flag resolution
# -----------------------------------------------------------------------------

def resolve_flag() -> str:
    """Resolve the challenge flag at runtime."""

    env_flag = os.environ.get("FLAG")

    if env_flag:
        return env_flag

    try:
        with open("/app/flag.txt", "r", encoding="utf-8") as fh:
            content = fh.read().strip()

            if content:
                return content

    except OSError:
        pass

    return "CTF{flag_not_configured}"


FLAG = resolve_flag()


# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()

    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY,
            owner_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            vault_reference TEXT,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS vault_resources (
            reference TEXT PRIMARY KEY,
            owner_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        );
        """
    )

    users = [
        (
            1,
            "alice",
            generate_password_hash("AliceVault2026!"),
            "user",
        ),
        (
            2,
            "bob",
            generate_password_hash("BobVault2026!"),
            "user",
        ),
        (
            3,
            "admin",
            generate_password_hash("AdminVault2026!"),
            "admin",
        ),
    ]

    for user in users:
        conn.execute(
            """
            INSERT OR IGNORE INTO users
            (id, username, password_hash, role)
            VALUES (?, ?, ?, ?)
            """,
            user,
        )

    documents = [
        (
            1001,
            1,
            "Project Proposal",
            "DuckVault migration project proposal.",
            None,
        ),
        (
            1002,
            1,
            "Expense Report",
            "Q3 infrastructure expense report.",
            None,
        ),
        (
            2001,
            2,
            "Security Assessment",
            (
                "Internal security assessment. "
                "Reference: vault-bob-7f3a"
            ),
            "vault-bob-7f3a",
        ),
        (
            2002,
            2,
            "Internal Review",
            "Internal review notes for the security team.",
            None,
        ),
        (
            9001,
            3,
            "Executive Document",
            "Restricted executive material.",
            "vault-admin-91ac",
        ),
    ]

    for document in documents:
        conn.execute(
            """
            INSERT OR IGNORE INTO documents
            (id, owner_id, title, content, vault_reference)
            VALUES (?, ?, ?, ?, ?)
            """,
            document,
        )

    vault_resources = [
        (
            "vault-bob-7f3a",
            2,
            "Bob's restricted security vault resource.",
        ),
        (
            "vault-admin-91ac",
            3,
            "Administrative vault resource.",
        ),
    ]

    for resource in vault_resources:
        conn.execute(
            """
            INSERT OR IGNORE INTO vault_resources
            (reference, owner_id, description)
            VALUES (?, ?, ?)
            """,
            resource,
        )

    conn.commit()
    conn.close()


# -----------------------------------------------------------------------------
# Authentication
# -----------------------------------------------------------------------------

def create_token(user):
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "role": user["role"],
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def get_current_user():
    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header[7:].strip()

    if not token:
        return None

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

    except jwt.InvalidTokenError:
        return None

    user_id = payload.get("sub")

    if not user_id:
        return None

    conn = get_db()

    user = conn.execute(
        """
        SELECT id, username, role
        FROM users
        WHERE id = ?
        """,
        (user_id,),
    ).fetchone()

    conn.close()

    return user


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):

        user = get_current_user()

        if not user:
            return jsonify({
                "error": "Authentication required"
            }), 401

        return fn(user, *args, **kwargs)

    return wrapper


# -----------------------------------------------------------------------------
# Health
# -----------------------------------------------------------------------------

@app.route("/health")
def health():
    return (
        '{"status":"ok"}',
        200,
        {"Content-Type": "application/json"},
    )


# -----------------------------------------------------------------------------
# Landing page
# -----------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


# -----------------------------------------------------------------------------
# Authentication API
# -----------------------------------------------------------------------------

@app.route("/api/login", methods=["POST"])
def login():

    data = request.get_json(silent=True) or {}

    username = data.get("username", "")
    password = data.get("password", "")

    conn = get_db()

    user = conn.execute(
        """
        SELECT id, username, password_hash, role
        FROM users
        WHERE username = ?
        """,
        (username,),
    ).fetchone()

    conn.close()

    if not user or not check_password_hash(
        user["password_hash"],
        password,
    ):
        return jsonify({
            "error": "Invalid credentials"
        }), 401

    token = create_token(user)

    return jsonify({
        "token": token,
        "token_type": "Bearer",
    })


# -----------------------------------------------------------------------------
# Current user
# -----------------------------------------------------------------------------

@app.route("/api/me")
@require_auth
def me(user):

    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
    })


# -----------------------------------------------------------------------------
# Document listing
# -----------------------------------------------------------------------------

@app.route("/api/documents")
@require_auth
def documents(user):

    conn = get_db()

    rows = conn.execute(
        """
        SELECT id, title, owner_id
        FROM documents
        WHERE owner_id = ?
        ORDER BY id
        """,
        (user["id"],),
    ).fetchall()

    conn.close()

    return jsonify({
        "documents": [
            {
                "id": row["id"],
                "title": row["title"],
                "owner_id": row["owner_id"],
            }
            for row in rows
        ]
    })


# -----------------------------------------------------------------------------
# Document retrieval
# -----------------------------------------------------------------------------

@app.route("/api/documents/<int:document_id>")
@require_auth
def get_document(user, document_id):

    conn = get_db()

    document = conn.execute(
        """
        SELECT
            id,
            owner_id,
            title,
            content,
            vault_reference
        FROM documents
        WHERE id = ?
        """,
        (document_id,),
    ).fetchone()

    conn.close()

    if not document:
        return jsonify({
            "error": "Document not found"
        }), 404

    # =========================================================================
    # INTENTIONAL BOLA
    #
    # The application verifies that the requester is authenticated, but it
    # does NOT verify that the requested document belongs to that user.
    #
    # Secure logic would additionally check:
    #
    #   document["owner_id"] == user["id"]
    #
    # This missing object-level authorization check is the intended weakness.
    # =========================================================================

    return jsonify({
        "id": document["id"],
        "owner_id": document["owner_id"],
        "title": document["title"],
        "content": document["content"],
        "vault_reference": document["vault_reference"],
    })


# -----------------------------------------------------------------------------
# Vault resource
# -----------------------------------------------------------------------------

@app.route("/api/vault/<reference>")
@require_auth
def vault(user, reference):
    conn = get_db()

    resource = conn.execute(
        """
        SELECT reference, owner_id, description
        FROM vault_resources
        WHERE reference = ?
        """,
        (reference,),
    ).fetchone()

    conn.close()

    if not resource:
        return jsonify({
            "error": "Resource not found"
        }), 404

    # INTENTIONAL BOLA
    # Missing object-level authorization check.
    # Any authenticated user can access a vault resource
    # if they know its reference.

    return jsonify({
        "reference": resource["reference"],
        "description": resource["description"],
        "flag": FLAG,
    })


# -----------------------------------------------------------------------------
# Application startup
# -----------------------------------------------------------------------------

# Database initialization is performed by the entrypoint
# before Gunicorn starts.


if __name__ == "__main__":
    raise SystemExit(
        "Run with gunicorn: gunicorn -c gunicorn.conf.py app:app"
    )