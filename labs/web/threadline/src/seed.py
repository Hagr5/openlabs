"""
ThreadLine Challenge - Seed / Reset Script
Restores the database to a known, deterministic initial state.
Run: python seed.py
"""
import sqlite3
import os
import hashlib

DB_PATH = os.environ.get("DB_PATH", "/data/threadline.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")

# Target account (the "victim") — its exact email is the piece of
# information the player must discover via BOLA. It is NOT printed
# anywhere else (README, error messages, other endpoints).
TARGET_EMAIL = "Hack25@gmail.com"
TARGET_USERNAME = "sara_target"
TARGET_PASSWORD = "N0tYourBusiness!2026"  # never exposed via any API response

PRODUCT_NAME = "Premium Leather Jacket"
PRODUCT_PRICE = 500

OFFER_DISCOUNT = 50  # fixed amount per coupon; 500 / 50 = 10 coupons needed


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def reset_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")

    with open(SCHEMA_PATH, "r") as f:
        conn.executescript(f.read())

    # Decoy / filler users seeded BEFORE the target so the target is never
    # trivially "id=1" — a player must actually enumerate a small range
    # rather than guessing the first id and winning immediately.
    decoys_before = [
        ("laila_shopper", "laila.shopper@threadline.local", "CustPass!01"),
        ("omar_customer", "omar.customer@threadline.local", "CustPass!02"),
        ("mo_ops", "mo.ops@threadline.local", "StaffPass!99"),
    ]
    for username, email, pw in decoys_before:
        conn.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (username, email, hash_password(pw)),
        )

    # Target / victim account — the player never registers this themselves.
    conn.execute(
        "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
        (TARGET_USERNAME, TARGET_EMAIL, hash_password(TARGET_PASSWORD)),
    )

    # A couple more decoys seeded AFTER the target, so id=(target+1) also
    # isn't a giveaway and the range around the target looks uniform.
    decoys_after = [
        ("nour_customer", "nour.customer@threadline.local", "CustPass!03"),
        ("khaled_customer", "khaled.customer@threadline.local", "CustPass!04"),
    ]
    for username, email, pw in decoys_after:
        conn.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (username, email, hash_password(pw)),
        )

    # Product the player needs to afford
    conn.execute(
        "INSERT INTO products (name, price) VALUES (?, ?)",
        (PRODUCT_NAME, PRODUCT_PRICE),
    )
    conn.execute(
        "INSERT INTO products (name, price) VALUES (?, ?)",
        ("Basic Cotton T-Shirt", 20),
    )

    # The single valid retention offer, tied to the exact target email
    conn.execute(
        "INSERT INTO offers (exact_email, discount_amount) VALUES (?, ?)",
        (TARGET_EMAIL, OFFER_DISCOUNT),
    )

    conn.commit()
    conn.close()
    print(f"[+] Database reset complete at {DB_PATH}")


if __name__ == "__main__":
    reset_db()
