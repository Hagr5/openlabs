const { lookupType } = require("./proto");
const db = require("./db");
const { USERS } = require("./db/seed");

const FLEET = 0;
const AUDIT = 1;
const AUTH = 2;

const HEARTBEAT_MS = 10 * 1000;
const AUDIT_EVERY_TICKS = 3;
const STREAM_TTL_MS = 5 * 60 * 1000;
const STATUS_ROTATION = ["EN_ROUTE", "IDLE", "CHARGING", "MAINTENANCE"];

const SessionAudit = lookupType("events.SessionAudit");
const TokenIssuedAudit = lookupType("events.TokenIssuedAudit");

function userByEmail(email) {
  return USERS.find((u) => u.email === email);
}

function encodeAudit(entry) {
  return Buffer.from(SessionAudit.encode(SessionAudit.fromObject(entry)).finish());
}

function encodeTokenIssued(entry) {
  return Buffer.from(TokenIssuedAudit.encode(TokenIssuedAudit.fromObject(entry)).finish());
}

const subscriptions = new Map();
let tick = 0;
let eventCounter = 0;

function nextId() {
  eventCounter += 1;
  return `ev-${Date.now().toString(36)}-${eventCounter.toString(36)}`;
}

function publish(event) {
  for (const [call, sub] of subscriptions) {
    if (!sub.allowed.has(event.category)) continue;
    try {
      call.write(event);
    } catch (err) {
      remove(call);
    }
  }
}

function rotateStatuses() {
  const vehicles = db.listVehicles();
  vehicles.forEach((vehicle, index) => {
    const status = STATUS_ROTATION[(tick + index) % STATUS_ROTATION.length];
    if (status !== vehicle.status) {
      db.setVehicleStatus(vehicle.id, status);
    }
  });
}

function auditCycle() {
  const routing = userByEmail("routing@duckurity.example");
  const maintenance = userByEmail("maintenance@duckurity.example");
  const admin = userByEmail("ops-admin@duckurity.example");
  const now = Date.now();
  const events = [
    {
      id: nextId(),
      timestamp: now,
      category: AUDIT,
      type: "session_audit",
      payload: encodeAudit({
        userId: routing.id,
        email: routing.email,
        action: "ROUTE_OPTIMIZATION_RUN",
      }),
    },
    {
      id: nextId(),
      timestamp: now,
      category: AUDIT,
      type: "session_audit",
      payload: encodeAudit({
        userId: maintenance.id,
        email: maintenance.email,
        action: "BULK_TELEMETRY_EXPORT",
      }),
    },
    {
      id: nextId(),
      timestamp: now,
      category: AUDIT,
      type: "session_audit",
      payload: encodeAudit({
        userId: admin.id,
        email: admin.email,
        action: "KEY_ROTATION_REMINDER",
      }),
    },
    {
      id: nextId(),
      timestamp: now,
      category: AUTH,
      type: "session_audit",
      payload: encodeAudit({
        userId: "svc-scheduler",
        email: "scheduler@services.duckurity.internal",
        action: "TOKEN_REFRESHED",
      }),
    },
    {
      id: nextId(),
      timestamp: now,
      category: AUDIT,
      type: "token_issued",
      payload: encodeTokenIssued({ issuedFor: "svc-scheduler", scope: "fleet:write" }),
    },
  ];
  for (const event of events) {
    publish(event);
  }
}

function heartbeat() {
  const active = db.listVehicles().length;
  publish({
    id: nextId(),
    timestamp: Date.now(),
    category: FLEET,
    type: "fleet_heartbeat",
    payload: Buffer.from(JSON.stringify({ tick, active }), "utf8"),
  });
}

function add(call, allowed) {
  const timer = setTimeout(() => {
    remove(call);
    try {
      call.end();
    } catch (err) {
      // stream already torn down
    }
  }, STREAM_TTL_MS);
  if (typeof timer.unref === "function") timer.unref();
  subscriptions.set(call, { allowed, timer });
  call.on("cancelled", () => {
    remove(call);
  });
}

function remove(call) {
  const sub = subscriptions.get(call);
  if (!sub) return;
  clearTimeout(sub.timer);
  subscriptions.delete(call);
}

let started = false;

function start() {
  if (started) return;
  started = true;
  const timer = setInterval(() => {
    tick += 1;
    try {
      rotateStatuses();
      heartbeat();
      if (tick % AUDIT_EVERY_TICKS === 0) {
        auditCycle();
      }
    } catch (err) {
      // emitter failures must never crash the server
    }
  }, HEARTBEAT_MS);
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = { add, remove, start };
