const { randomBytes } = require('crypto');

function createSessionModel(db) {
  return {
    create(userId) {
      const token = randomBytes(32).toString('hex');
      db.prepare(
        `INSERT INTO sessions (token, user_id) VALUES (?, ?)`
      ).run(token, userId);
      return token;
    },

    findUserIdByToken(token) {
      const row = db
        .prepare('SELECT user_id FROM sessions WHERE token = ?')
        .get(token);
      return row ? row.user_id : null;
    },
  };
}

module.exports = { createSessionModel };
