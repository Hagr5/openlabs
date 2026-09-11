"use strict";

const crypto = require("crypto");
const { getDb } = require("../db");

function rowToUser(row, { includeCredentials = false } = {}) {
  if (!row) return null;
  const user = {
    id: row.id,
    accountId: row.accountId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    locale: row.locale,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (includeCredentials) {
    user.passwordHash = row.passwordHash;
  }
  return user;
}

function findById(id) {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
  return rowToUser(row);
}

function findByEmail(email) {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
    .get(email);
  return rowToUser(row, { includeCredentials: true });
}

function updateProfile(id, { firstName, lastName, locale }) {
  const db = getDb();
  const current = findById(id);
  if (!current) return null;
  const next = {
    firstName: firstName !== undefined ? firstName : current.firstName,
    lastName: lastName !== undefined ? lastName : current.lastName,
    locale: locale !== undefined ? locale : current.locale,
  };
  db.prepare(
    `UPDATE users SET firstName = ?, lastName = ?, locale = ?, updatedAt = ?
     WHERE id = ?`
  ).run(
    next.firstName,
    next.lastName,
    next.locale,
    new Date().toISOString(),
    id
  );
  return findById(id);
}

module.exports = {
  users: {
    findById,
    findByEmail,
    updateProfile,
    rowToUser,
  },
  accounts: {
    findById(id) {
      return (
        getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(id) || null
      );
    },
  },
  products: {
    list() {
      return getDb()
        .prepare("SELECT * FROM products ORDER BY id ASC")
        .all();
    },
  },
  loginFailures: {
    get(email) {
      return (
        getDb()
          .prepare("SELECT * FROM login_failures WHERE email = ?")
          .get(email) || null
      );
    },
    recordFailure(email) {
      const db = getDb();
      const now = new Date();
      const existing = this.get(email);
      if (!existing || this.isExpired(existing, now)) {
        db.prepare(
          `INSERT INTO login_failures (email, failures, firstFailureAt, lockedUntil)
           VALUES (?, 1, ?, NULL)
           ON CONFLICT(email) DO UPDATE SET failures = 1, firstFailureAt = excluded.firstFailureAt, lockedUntil = NULL`
        ).run(email, now.toISOString());
        return;
      }
      const failures = existing.failures + 1;
      let lockedUntil = null;
      if (failures >= 5) {
        lockedUntil = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
      }
      db.prepare(
        `UPDATE login_failures SET failures = ?, lockedUntil = ? WHERE email = ?`
      ).run(failures, lockedUntil, email);
    },
    isExpired(record, now = new Date()) {
      if (!record) return true;
      if (record.lockedUntil) {
        return new Date(record.lockedUntil).getTime() <= now.getTime();
      }
      return new Date(record.firstFailureAt).getTime() + 10 * 60 * 1000 <= now.getTime();
    },
    clear(email) {
      getDb()
        .prepare("DELETE FROM login_failures WHERE email = ?")
        .run(email);
    },
  },
  functions: {
    findById(id) {
      return getDb().prepare("SELECT * FROM functions WHERE id = ?").get(id) || null;
    },
    listByAccount(accountId, { first = 20, after } = {}) {
      const db = getDb();
      let rows;
      let hasMore = false;
      if (after) {
        rows = db
          .prepare(
            `SELECT * FROM functions WHERE accountId = ? AND createdAt > ? ORDER BY createdAt ASC LIMIT ?`
          )
          .all(accountId, after, first + 1);
      } else {
        rows = db
          .prepare(
            `SELECT * FROM functions WHERE accountId = ? ORDER BY createdAt ASC LIMIT ?`
          )
          .all(accountId, first + 1);
      }
      if (rows.length > first) {
        rows = rows.slice(0, first);
        hasMore = true;
      }
      return { rows, hasMore };
    },
    countByAccount(accountId) {
      return (
        getDb()
          .prepare("SELECT COUNT(*) AS n FROM functions WHERE accountId = ?")
          .get(accountId).n
      );
    },
    create({ accountId, name, codeFileName, active }) {
      const db = getDb();
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const token = crypto.randomBytes(20).toString("hex");
      db.prepare(
        `INSERT INTO functions (id, accountId, name, codeFileName, active, status, runtime, uploadToken, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'PENDING_PACKAGE_UPLOAD', NULL, ?, ?, ?)`
      ).run(id, accountId, name, codeFileName, active ? 1 : 0, token, now, now);
      db.prepare(
        `INSERT INTO staged_uploads (token, functionId, createdAt) VALUES (?, ?, ?)`
      ).run(token, id, now);
      return this.findById(id);
    },
    updateStatus(id, fields) {
      const db = getDb();
      const current = this.findById(id);
      if (!current) return null;
      const merged = { ...current, ...fields, updatedAt: new Date().toISOString() };
      db.prepare(
        `UPDATE functions SET status = ?, runtime = ?, packageMain = ?, active = ?, updatedAt = ?
         WHERE id = ?`
      ).run(
        merged.status,
        merged.runtime,
        merged.packageMain,
        merged.active ? 1 : 0,
        merged.updatedAt,
        id
      );
      return this.findById(id);
    },
    findByUploadToken(token) {
      const row = getDb()
        .prepare(
          `SELECT f.* FROM functions f
           JOIN staged_uploads s ON s.functionId = f.id
           WHERE s.token = ? AND s.consumedAt IS NULL`
        )
        .get(token);
      return row || null;
    },
    markUploadConsumed(token) {
      const db = getDb();
      const row = db
        .prepare("SELECT functionId FROM staged_uploads WHERE token = ?")
        .get(token);
      db.prepare("UPDATE staged_uploads SET consumedAt = ? WHERE token = ?").run(
        new Date().toISOString(),
        token
      );
      if (row) {
        db.prepare("UPDATE functions SET uploadToken = NULL WHERE id = ?").run(
          row.functionId
        );
      }
    },
    deleteById(id) {
      const db = getDb();
      db.prepare("DELETE FROM function_invocations WHERE functionId = ?").run(id);
      db.prepare("DELETE FROM staged_uploads WHERE functionId = ?").run(id);
      db.prepare("DELETE FROM webhook_configurations WHERE destinationFunctionId = ?").run(id);
      db.prepare("DELETE FROM functions WHERE id = ?").run(id);
    },
  },
  invocations: {
    findById(id) {
      return (
        getDb()
          .prepare("SELECT * FROM function_invocations WHERE id = ?")
          .get(id) || null
      );
    },
    create({ functionId, successful, startedOn, endedOn, error, logs }) {
      const db = getDb();
      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO function_invocations (id, functionId, successful, startedOn, endedOn, error, logs)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        functionId,
        successful ? 1 : 0,
        startedOn,
        endedOn,
        error,
        JSON.stringify(logs || [])
      );
      return this.findById(id);
    },
  },
  webhooks: {
    findById(id) {
      return (
        getDb()
          .prepare("SELECT * FROM webhook_configurations WHERE id = ?")
          .get(id) || null
      );
    },
    listByAccount(accountId, { first = 20, after } = {}) {
      const db = getDb();
      let rows;
      let hasMore = false;
      if (after) {
        rows = db
          .prepare(
            `SELECT * FROM webhook_configurations WHERE accountId = ? AND createdAt > ? ORDER BY createdAt ASC LIMIT ?`
          )
          .all(accountId, after, first + 1);
      } else {
        rows = db
          .prepare(
            `SELECT * FROM webhook_configurations WHERE accountId = ? ORDER BY createdAt ASC LIMIT ?`
          )
          .all(accountId, first + 1);
      }
      if (rows.length > first) {
        rows = rows.slice(0, first);
        hasMore = true;
      }
      return { rows, hasMore };
    },
    countByAccount(accountId) {
      return (
        getDb()
          .prepare("SELECT COUNT(*) AS n FROM webhook_configurations WHERE accountId = ?")
          .get(accountId).n
      );
    },
    create({ accountId, resourceType, resourceActions, destinationType, destinationFunctionId }) {
      const db = getDb();
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO webhook_configurations
         (id, accountId, status, resourceType, resourceActions, destinationType, destinationFunctionId, lastDeliveryId, createdAt)
         VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?, NULL, ?)`
      ).run(
        id,
        accountId,
        resourceType,
        JSON.stringify(resourceActions),
        destinationType,
        destinationFunctionId,
        now
      );
      return this.findById(id);
    },
    findActiveForEvent(accountId, resourceType, action) {
      const rows = getDb()
        .prepare(
          `SELECT * FROM webhook_configurations WHERE accountId = ? AND status = 'ACTIVE' AND resourceType = ?`
        )
        .all(accountId, resourceType);
      return rows.filter((row) => {
        try {
          const actions = JSON.parse(row.resourceActions);
          return Array.isArray(actions) && actions.includes(action);
        } catch {
          return false;
        }
      });
    },
    recordDelivery(id, invocationId) {
      getDb()
        .prepare("UPDATE webhook_configurations SET lastDeliveryId = ? WHERE id = ?")
        .run(invocationId, id);
    },
    deleteById(id) {
      const db = getDb();
      const row = this.findById(id);
      if (row && row.destinationFunctionId) {
        // deliveries are stored on the function invocation, nothing else to purge
      }
      db.prepare("DELETE FROM webhook_configurations WHERE id = ?").run(id);
    },
  },
};
