const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { seed } = require("./seed");

const DB_PATH = process.env.DB_PATH || "/data/duckfleet.db";

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vehicles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    zone TEXT NOT NULL,
    driver_name TEXT NOT NULL
  );
`);

const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
if (userCount === 0) {
  seed(db);
}

const queries = {
  getUserByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  getUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
  clearLoginState: db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?"),
  bumpFailures: db.prepare("UPDATE users SET failed_attempts = ? WHERE id = ?"),
  applyLockout: db.prepare("UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?"),
  listVehicles: db.prepare("SELECT id, name, status, zone, driver_name FROM vehicles ORDER BY id ASC"),
  listVehiclesByZone: db.prepare(
    "SELECT id, name, status, zone, driver_name FROM vehicles WHERE zone = ? ORDER BY id ASC"
  ),
  getVehicleById: db.prepare("SELECT id, name, status, zone, driver_name FROM vehicles WHERE id = ?"),
  setVehicleStatus: db.prepare("UPDATE vehicles SET status = ? WHERE id = ?"),
};

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 10 * 60 * 1000;

function getUserByEmail(email) {
  if (!email) return undefined;
  return queries.getUserByEmail.get(email);
}

function getUserById(id) {
  if (!id) return undefined;
  return queries.getUserById.get(id);
}

function isLocked(user) {
  return user.locked_until !== null && user.locked_until > Date.now();
}

function recordLoginSuccess(userId) {
  queries.clearLoginState.run(userId);
}

function recordLoginFailure(user) {
  const attempts = (user.failed_attempts || 0) + 1;
  if (attempts >= LOCKOUT_THRESHOLD) {
    queries.applyLockout.run(Date.now() + LOCKOUT_MS, user.id);
  } else {
    queries.bumpFailures.run(attempts, user.id);
  }
}

function rowToVehicle(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    zone: row.zone,
    driverName: row.driver_name,
  };
}

function listVehicles(zone) {
  const rows = zone ? queries.listVehiclesByZone.all(zone) : queries.listVehicles.all();
  return rows.map(rowToVehicle);
}

function getVehicleById(id) {
  const row = queries.getVehicleById.get(id);
  return row ? rowToVehicle(row) : undefined;
}

function setVehicleStatus(id, status) {
  queries.setVehicleStatus.run(status, id);
}

module.exports = {
  getUserByEmail,
  getUserById,
  isLocked,
  recordLoginSuccess,
  recordLoginFailure,
  listVehicles,
  getVehicleById,
  setVehicleStatus,
  LOCKOUT_MS,
};
