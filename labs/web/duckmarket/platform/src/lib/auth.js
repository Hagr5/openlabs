"use strict";

const crypto = require("crypto");
const config = require("../config");

// In-memory session store. Sessions expire after the configured TTL.
const sessions = new Map();

const SESSION_COOKIE = "SESSIONID";
const XSRF_COOKIE = "XSRF-TOKEN";
const XSRF_HEADER = "X-XSRF-TOKEN";

function newSession(user) {
  const id = crypto.randomBytes(16).toString("hex"); // 128-bit
  const xsrf = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + config.sessionTtlMs;
  sessions.set(id, { id, userId: user.id, xsrf, expiresAt });
  return sessions.get(id);
}

function getSession(id) {
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(id);
    return null;
  }
  return session;
}

function destroySession(id) {
  sessions.delete(id);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

function sessionCookieHeader(session) {
  const expires = new Date(session.expiresAt).toUTCString();
  return [
    `${SESSION_COOKIE}=${session.id}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`,
  ];
}

function xsrfCookieHeader(session) {
  const expires = new Date(session.expiresAt).toUTCString();
  return [
    `${XSRF_COOKIE}=${session.xsrf}; Path=/; SameSite=Lax; Expires=${expires}`,
  ];
}

function clearCookieHeaders() {
  const past = "Thu, 01 Jan 1970 00:00:00 GMT";
  return [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=${past}`,
    `${XSRF_COOKIE}=; Path=/; SameSite=Lax; Expires=${past}`,
  ];
}

function isMutatingMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function verifyCsrf(req, session) {
  if (!session) return false;
  if (!isMutatingMethod(req.method)) return true;
  const header = req.headers["x-xsrf-token"];
  return typeof header === "string" && header.length > 0 && header === session.xsrf;
}

module.exports = {
  newSession,
  getSession,
  destroySession,
  parseCookies,
  sessionCookieHeaders: sessionCookieHeader,
  xsrfCookieHeaders: xsrfCookieHeader,
  clearCookieHeaders,
  verifyCsrf,
  SESSION_COOKIE,
  XSRF_COOKIE,
  XSRF_HEADER,
};
