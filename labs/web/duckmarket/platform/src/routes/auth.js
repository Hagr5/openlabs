"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const config = require("../config");
const auth = require("../lib/auth");
const repo = require("../db/repositories");
const logger = require("../lib/logger");

const router = express.Router();

const GENERIC_LOGIN_ERROR = "Invalid email or password.";
const LOCKED_MESSAGE =
  "Too many failed sign-in attempts. This account is temporarily locked.";

function getLoginWindowLocked(email) {
  const record = repo.loginFailures.get(email);
  if (!record) return false;
  if (record.lockedUntil && new Date(record.lockedUntil).getTime() > Date.now()) {
    return true;
  }
  return false;
}

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.length === 0 ||
    email.length > 320 ||
    password.length === 0 ||
    password.length > 200
  ) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Invalid email or password." });
  }

  if (getLoginWindowLocked(email)) {
    return res.status(429).json({ error: "ACCOUNT_LOCKED", message: LOCKED_MESSAGE });
  }

  const user = repo.users.findByEmail(email);

  // Constant-shape verification: always run a bcrypt compare (against a dummy
  // hash when the account does not exist) to avoid leaking account existence
  // through response timing.
  const hashForTiming = user
    ? user.passwordHash
    : "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
  const passwordMatches = bcrypt.compareSync(password, hashForTiming);

  if (!user || !passwordMatches) {
    repo.loginFailures.recordFailure(email);
    const updated = repo.loginFailures.get(email);
    if (updated && updated.lockedUntil && new Date(updated.lockedUntil).getTime() > Date.now()) {
      return res.status(429).json({ error: "ACCOUNT_LOCKED", message: LOCKED_MESSAGE });
    }
    return res.status(401).json({ error: "INVALID_CREDENTIALS", message: GENERIC_LOGIN_ERROR });
  }

  repo.loginFailures.clear(user.email);

  const session = auth.newSession(user);
  const headers = [
    ...auth.sessionCookieHeaders(session),
    ...auth.xsrfCookieHeaders(session),
  ];
  res.setHeader("set-cookie", headers);
  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      locale: user.locale,
      role: user.role,
    },
  });
});

router.post("/auth/logout", (req, res) => {
  const cookies = auth.parseCookies(req.headers.cookie);
  const session = auth.getSession(cookies[auth.SESSION_COOKIE]);
  if (session) {
    auth.destroySession(session.id);
  }
  res.setHeader("set-cookie", auth.clearCookieHeaders());
  res.json({ ok: true });
});

module.exports = router;
