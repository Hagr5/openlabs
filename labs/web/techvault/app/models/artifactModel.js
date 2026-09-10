const { randomUUID } = require('crypto');

function createArtifactModel(db) {
  return {
    /**
     * Creates a new artifact row. `source` is internal bookkeeping only
     * ('preview' | 'competitor_check') — never exposed via GraphQL.
     */
    create({ ownerUserId, title, status = 'PENDING', content = null, source }) {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO preview_artifacts
           (id, owner_user_id, title, status, content, source)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, ownerUserId, title, status, content, source);
      return this.findById(id);
    },

    update(id, { status, content }) {
      db.prepare(
        `UPDATE preview_artifacts SET status = ?, content = ? WHERE id = ?`
      ).run(status, content, id);
      return this.findById(id);
    },

    findById(id) {
      return db
        .prepare('SELECT * FROM preview_artifacts WHERE id = ?')
        .get(id);
    },

    listByOwner(ownerUserId, limit = 10) {
      return db
        .prepare(
          `SELECT * FROM preview_artifacts
           WHERE owner_user_id = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?`
        )
        .all(ownerUserId, limit);
    },

    /**
     * Ownership-checked retrieval — the ONLY way resolvers should fetch
     * full artifact content. Returns undefined if the artifact doesn't
     * exist OR belongs to a different user (both cases are indistinguishable
     * to the caller, by design — see resolver-design.md).
     */
    findByIdForOwner(id, ownerUserId) {
      return db
        .prepare(
          `SELECT * FROM preview_artifacts WHERE id = ? AND owner_user_id = ?`
        )
        .get(id, ownerUserId);
    },
  };
}

module.exports = { createArtifactModel };
