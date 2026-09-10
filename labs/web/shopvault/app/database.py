import sqlite3
import os
from werkzeug.security import generate_password_hash

DB_PATH = "/tmp/shopvault.db"

def init_db():
    """Initialize SQLite database with users table."""
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1
        )
    """)
    
    # Seed users
    users = [
        ("shopvault_user", "password123", "user"),
        ("admin01", "VMoczRRPGtfZQ9Qh6YtiYe5r2D62tlKMykK-HEm9i74", "admin"),
        ("star_user", "vZYvtE6oj9sycHI5JqdHReWYVpMzcU3nlBZcw0_Gmn8", "manager")
    ]
    
    for username, password, role in users:
        pwd_hash = generate_password_hash(password)
        cursor.execute("""
            INSERT INTO users (username, password_hash, role, is_active)
            VALUES (?, ?, ?, 1)
        """, (username, pwd_hash, role))
    
    conn.commit()
    conn.close()

def get_db():
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_user_by_username(username):
    """Fetch user by username."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    db.close()
    return dict(user) if user else None

def get_user_by_id(user_id):
    """Fetch user by ID."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    db.close()
    return dict(user) if user else None

def update_user_password(user_id, new_password_hash):
    """Update user password (admin endpoint)."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        UPDATE users SET password_hash = ? WHERE id = ?
    """, (new_password_hash, user_id))
    db.commit()
    db.close()

def list_all_users():
    """List all users (admin endpoint)."""
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT id, username, role, is_active FROM users")
    users = [dict(row) for row in cursor.fetchall()]
    db.close()
    return users
