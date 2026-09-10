-- =========================================================
-- TechVault — Database Schema (SQLite for the challenge lab)
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,          -- UUID
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,             -- real bcrypt hash (used by the
                                              -- *intended* code path)
    role          TEXT NOT NULL DEFAULT 'CUSTOMER',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS laptops (
    id        TEXT PRIMARY KEY,              -- UUID
    name      TEXT NOT NULL,
    brand     TEXT NOT NULL,
    price     REAL NOT NULL,
    stock     INTEGER NOT NULL DEFAULT 0,
    cpu       TEXT,
    ram       TEXT,
    storage   TEXT,
    gpu       TEXT
);

-- Unified artifact storage: used by BOTH generatePreview (command-injection
-- surface) and the billing-core SSRF side effect. This shared table is the
-- convergence point of the attack chain.
CREATE TABLE IF NOT EXISTS preview_artifacts (
    id             TEXT PRIMARY KEY,         -- UUID, non-guessable
    owner_user_id  TEXT NOT NULL,            -- FK -> users.id, ownership check
    title          TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING|COMPLETED|FAILED
    content        TEXT,                     -- full rendered content (nullable
                                              -- while PENDING)
    source         TEXT NOT NULL,            -- 'preview' | 'competitor_check'
                                              -- (internal bookkeeping only,
                                              -- never exposed in the schema)
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_owner ON preview_artifacts(owner_user_id);

-- Session tokens (simple opaque token store instead of JWT, to keep the auth
-- bypass focused purely on the password-handling logic, not token forgery).
CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
