const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');

function createUserModel(db) {
  return {
    findByUsername(username) {
      return db
        .prepare('SELECT * FROM users WHERE username = ?')
        .get(username);
    },

    findById(id) {
      return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    },

    // Used only by seed scripts — real registration flow is out of scope
    // for this challenge (accounts are pre-provisioned).
    create({ username, email, password, role = 'CUSTOMER' }) {
      const id = randomUUID();
      const passwordHash = bcrypt.hashSync(password, 10);
      db.prepare(
        `INSERT INTO users (id, username, email, password_hash, role)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, username, email, passwordHash, role);
      return this.findById(id);
    },

    verifyPassword(user, plainPassword) {
      if (!user || typeof plainPassword !== 'string') return false;
      return bcrypt.compareSync(plainPassword, user.password_hash);
    },
  };
}

module.exports = { createUserModel };
