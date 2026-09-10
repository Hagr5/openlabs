const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { PRIVATE_KEY, KID, getJwks } = require('../keys');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

router.post('/signup', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Bad Request', message: 'username and password required' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'username must be 3-32 characters (letters, numbers, . _ -)'
    });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Bad Request', message: 'password must be at least 8 characters' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Conflict', message: 'username already taken' });
  }

  // Every account created here is always given the "employee" role.
  // The client cannot request a different role at signup.
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, hash, 'employee');

  const token = jwt.sign(
    { sub: username, role: 'employee' },
    PRIVATE_KEY,
    { algorithm: 'RS256', keyid: KID, expiresIn: '2h' }
  );

  res.status(201).json({ token, role: 'employee' });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Bad Request', message: 'username and password required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { sub: user.username, role: user.role },
    PRIVATE_KEY,
    { algorithm: 'RS256', keyid: KID, expiresIn: '2h' }
  );

  res.json({ token, role: user.role });
});

module.exports = router;
module.exports.getJwks = getJwks;
