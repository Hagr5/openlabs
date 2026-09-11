"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("../config");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL REFERENCES accounts(id),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  passwordHash TEXT NOT NULL,
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'en-US',
  role TEXT NOT NULL DEFAULT 'ROLE_USER',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priceCents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  stock INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS functions (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  codeFileName TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING_PACKAGE_UPLOAD',
  runtime TEXT,
  uploadToken TEXT,
  packageMain TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE (accountId, name)
);

CREATE TABLE IF NOT EXISTS webhook_configurations (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL REFERENCES accounts(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  resourceType TEXT NOT NULL,
  resourceActions TEXT NOT NULL, -- JSON array
  destinationType TEXT NOT NULL DEFAULT 'NONE',
  destinationFunctionId TEXT,
  lastDeliveryId TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS function_invocations (
  id TEXT PRIMARY KEY,
  functionId TEXT NOT NULL REFERENCES functions(id),
  successful INTEGER NOT NULL DEFAULT 0,
  startedOn TEXT NOT NULL,
  endedOn TEXT,
  error TEXT,
  logs TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS login_failures (
  email TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  firstFailureAt TEXT,
  lockedUntil TEXT
);

CREATE TABLE IF NOT EXISTS staged_uploads (
  token TEXT PRIMARY KEY,
  functionId TEXT NOT NULL REFERENCES functions(id),
  createdAt TEXT NOT NULL,
  consumedAt TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_account ON users(accountId);
CREATE INDEX IF NOT EXISTS idx_functions_account ON functions(accountId);
CREATE INDEX IF NOT EXISTS idx_invocations_function ON function_invocations(functionId);
CREATE INDEX IF NOT EXISTS idx_webhooks_account ON webhook_configurations(accountId);
`;

let db = null;

function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

module.exports = { getDb };
