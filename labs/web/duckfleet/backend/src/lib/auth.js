const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { hashPassword } = require("../db/seed");

const TOKEN_TTL_SECONDS = 7200;
const CLOCK_SKEW_SECONDS = 30;
const ISSUER = "duckfleet";

function loadSecret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    return Buffer.from(fromEnv, "utf8");
  }
  const dbPath = process.env.DB_PATH || "/data/duckfleet.db";
  const keyFile = path.join(path.dirname(dbPath), "session.key");
  try {
    const existing = fs.readFileSync(keyFile);
    if (existing.length >= 32) return existing;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const secret = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, secret, { mode: 0o600 });
  return secret;
}

const SECRET = loadSecret();

function b64urlEncode(buf) {
  return Buffer.from(buf).toString("base64url");
}

function b64urlDecode(str) {
  return Buffer.from(String(str), "base64url");
}

const HEADER_SEGMENT = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));

function signToken(userId, role, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(
    JSON.stringify({
      sub: userId,
      role,
      iss: ISSUER,
      iat: now,
      exp: now + (ttlSeconds || TOKEN_TTL_SECONDS),
    })
  );
  const signingInput = `${HEADER_SEGMENT}.${payload}`;
  const signature = b64urlEncode(crypto.createHmac("sha256", SECRET).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}

function authFailure(details) {
  return { code: 16, details };
}

function verifyToken(token) {
  if (!token || typeof token !== "string") {
    throw authFailure("AUTH_REQUIRED");
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw authFailure("INVALID_TOKEN");
  }
  const [headerSeg, payloadSeg, sigSeg] = parts;
  let header;
  try {
    header = JSON.parse(b64urlDecode(headerSeg).toString("utf8"));
  } catch (err) {
    throw authFailure("INVALID_TOKEN");
  }
  if (!header || header.alg !== "HS256") {
    throw authFailure("INVALID_TOKEN");
  }
  const expected = b64urlEncode(
    crypto.createHmac("sha256", SECRET).update(`${headerSeg}.${payloadSeg}`).digest()
  );
  const presented = Buffer.from(sigSeg, "utf8");
  const digest = Buffer.from(expected, "utf8");
  if (presented.length !== digest.length || !crypto.timingSafeEqual(presented, digest)) {
    throw authFailure("INVALID_TOKEN");
  }
  let claims;
  try {
    claims = JSON.parse(b64urlDecode(payloadSeg).toString("utf8"));
  } catch (err) {
    throw authFailure("INVALID_TOKEN");
  }
  if (!claims || typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw authFailure("INVALID_TOKEN");
  }
  if (typeof claims.exp !== "number" || Date.now() / 1000 > claims.exp + CLOCK_SKEW_SECONDS) {
    throw authFailure("TOKEN_EXPIRED");
  }
  return claims;
}

function authenticate(call) {
  const values = call.metadata.get("authorization") || [];
  const header = values.length > 0 ? String(values[0]) : "";
  if (!header) {
    throw authFailure("AUTH_REQUIRED");
  }
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
  return verifyToken(token.trim());
}

function verifyPassword(password, user) {
  if (!password || !user) return false;
  const candidate = hashPassword(password, user.salt);
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(user.password_hash, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  signToken,
  verifyToken,
  authenticate,
  verifyPassword,
  TOKEN_TTL_SECONDS,
};
