const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'techvault.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

function initDatabase() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  return db;
}

// Full, deterministic reset used by the reset endpoint / test harness.
// Drops and recreates every table, then re-applies schema.sql.
function resetDatabase(db) {
  db.exec(`
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS preview_artifacts;
    DROP TABLE IF EXISTS laptops;
    DROP TABLE IF EXISTS users;
  `);
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
}

module.exports = { initDatabase, resetDatabase, DB_PATH };
