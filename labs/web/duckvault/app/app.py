import os
import secrets
import sqlite3
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DUCKVAULT_DB", "/tmp/duckvault.db"))

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY") or secrets.token_hex(32)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = db()
    cur = conn.cursor()

    cur.executescript(
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
            classification TEXT NOT NULL,
            content TEXT NOT NULL,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY,
            owner_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            flag TEXT,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        );
        """
    )

    if cur.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        cur.execute(
            "INSERT INTO users(id, username, password_hash, role) VALUES (?, ?, ?, ?)",
            (1, "intern", generate_password_hash("intern123"), "employee"),
        )

        cur.execute(
            "INSERT INTO users(id, username, password_hash, role) VALUES (?, ?, ?, ?)",
            (2, "administrator", generate_password_hash(secrets.token_urlsafe(24)), "admin"),
        )

        cur.execute(
            "INSERT INTO documents(id, owner_id, title, classification, content) VALUES (?, ?, ?, ?, ?)",
            (
                1042,
                1,
                "New Hire Access Brief",
                "INTERNAL",
                "Welcome to DuckVault. Your current employee workspace contains onboarding notes, policy references, and archived internal records. Some older records were migrated from the legacy document sequence.",
            ),
        )

        cur.execute(
            "INSERT INTO documents(id, owner_id, title, classification, content) VALUES (?, ?, ?, ?, ?)",
            (
                1044,
                2,
                "Privileged Access Review Notes",
                "RESTRICTED",
                "Quarterly privileged-access review notes were moved after the legacy archive migration. "
                "Migration metadata exposed an internal export target: report_id=7331. "
                "Security administration exports are processed through the Admin Export Jobs API. "
                "This record is intended for security administration review only.",
            ),
        )

        flag = f"DUCK{{bola_to_bfla_export_chain_{secrets.token_hex(6)}}}"

        cur.execute(
            "INSERT INTO reports(id, owner_id, title, body, flag) VALUES (?, ?, ?, ?, ?)",
            (
                7331,
                2,
                "Q3 Privileged Access Audit Report",
                "This restricted report belongs to the security administration workspace. "
                "It should only be exportable through administrator-only functionality.",
                flag,
            ),
        )

        conn.commit()

    conn.close()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "authentication required"}), 401

            return redirect(url_for("login"))

        return fn(*args, **kwargs)

    return wrapper


@app.get("/health")
def health():
    try:
        conn = db()
        conn.execute("SELECT 1").fetchone()
        conn.close()

        return jsonify({"status": "ok"}), 200

    except Exception:
        return jsonify({"status": "error"}), 500


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        if "user_id" in session:
            return redirect(url_for("dashboard"))

        return render_template("login.html", error=None)

    username = request.form.get("username", "")
    password = request.form.get("password", "")

    conn = db()
    user = conn.execute(
        "SELECT * FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    conn.close()

    if not user or not check_password_hash(user["password_hash"], password):
        return render_template("login.html", error="Invalid username or password"), 401

    session.clear()
    session["user_id"] = user["id"]
    session["username"] = user["username"]
    session["role"] = user["role"]

    return redirect(url_for("dashboard"))


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.get("/")
def index():
    return redirect(url_for("dashboard") if "user_id" in session else url_for("login"))


@app.get("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html", username=session["username"])


@app.get("/documents/<int:doc_id>")
@login_required
def document_page(doc_id):
    return render_template("document.html", doc_id=doc_id)


@app.get("/api/me/documents")
@login_required
def my_documents():
    conn = db()

    rows = conn.execute(
        """
        SELECT id, title, classification
        FROM documents
        WHERE owner_id = ?
        ORDER BY id
        """,
        (session["user_id"],),
    ).fetchall()

    conn.close()

    return jsonify([dict(r) for r in rows])


@app.get("/api/documents/<int:doc_id>")
@login_required
def get_document(doc_id):
    conn = db()

    row = conn.execute(
        """
        SELECT
            d.id,
            d.owner_id,
            d.title,
            d.classification,
            d.content,
            u.username AS owner
        FROM documents d
        JOIN users u ON u.id = d.owner_id
        WHERE d.id = ?
        """,
        (doc_id,),
    ).fetchone()

    conn.close()

    if not row:
        return jsonify({"error": "document not found"}), 404

    # INTENTIONALLY VULNERABLE FOR THE CTF:
    # The application verifies authentication only.
    # It does not verify that the current user owns this document object.
    return jsonify(dict(row))


@app.get("/api/reports/<int:report_id>")
@login_required
def get_report(report_id):
    conn = db()

    row = conn.execute(
        """
        SELECT
            r.id,
            r.owner_id,
            r.title,
            r.body,
            u.username AS owner
        FROM reports r
        JOIN users u ON u.id = r.owner_id
        WHERE r.id = ?
        """,
        (report_id,),
    ).fetchone()

    conn.close()

    if not row:
        return jsonify({"error": "report not found"}), 404

    return jsonify(
        {
            "id": row["id"],
            "title": row["title"],
            "owner": row["owner"],
            "classification": "RESTRICTED_REPORT",
            "message": "Report metadata is visible, but full export requires an admin export job.",
            "export_required": True,
        }
    )


@app.post("/api/admin/exports")
@login_required
def create_admin_export():
    data = request.get_json(silent=True) or {}
    report_id = data.get("report_id")

    if not report_id:
        return jsonify({"error": "report_id is required"}), 400

    conn = db()

    row = conn.execute(
        """
        SELECT
            r.id,
            r.owner_id,
            r.title,
            r.body,
            r.flag,
            u.username AS owner
        FROM reports r
        JOIN users u ON u.id = r.owner_id
        WHERE r.id = ?
        """,
        (report_id,),
    ).fetchone()

    conn.close()

    if not row:
        return jsonify({"error": "report not found"}), 404

    # INTENTIONALLY VULNERABLE FOR THE CTF:
    # This endpoint represents an administrator-only export function.
    # It should check that session["role"] == "admin", but it only checks login.
    # This creates Broken Function Level Authorization.
    return jsonify(
        {
            "export_status": "completed",
            "export_type": "administrator_report_export",
            "required_role": "admin",
            "current_user": session.get("username"),
            "current_role": session.get("role"),
            "access_control_status": "missing admin role validation",
            "report": {
                "id": row["id"],
                "title": row["title"],
                "owner": row["owner"],
                "classification": "ADMIN_RESTRICTED",
                "body": row["body"],
            },
            "flag": row["flag"],
        }
    )


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)
else:
    init_db()