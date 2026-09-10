const grpc = require("@grpc/grpc-js");
const { authenticate } = require("../lib/auth");
const emitter = require("../emitter");

const FLEET = 0;
const AUDIT = 1;
const AUTH = 2;

const NAMES = { FLEET, AUDIT, AUTH };

function normalizeCategories(raw) {
  const out = new Set();
  const values = Array.isArray(raw) ? raw : [];
  for (const v of values) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 2) {
      out.add(v);
    } else if (typeof v === "string" && Object.prototype.hasOwnProperty.call(NAMES, v)) {
      out.add(NAMES[v]);
    }
  }
  return out;
}

function subscribe(call) {
  try {
    authenticate(call);
  } catch (err) {
    call.emit("error", err);
    return;
  }
  const internal = call.metadata.get("x-internal-call") || [];
  const isInternal = String(internal[0] || "").toLowerCase() === "true";
  const requested = normalizeCategories(call.request ? call.request.categories : undefined);
  let allowed;
  if (isInternal) {
    allowed = requested.size > 0 ? requested : new Set([FLEET]);
  } else {
    allowed = new Set();
    for (const c of requested) {
      if (c === FLEET) allowed.add(c);
    }
    if (allowed.size === 0) allowed.add(FLEET);
  }
  let acl = "public";
  for (const c of allowed) {
    if (c !== FLEET) {
      acl = "internal";
      break;
    }
  }
  const initial = new grpc.Metadata();
  initial.set("x-acl", acl);
  call.sendMetadata(initial);
  emitter.add(call, allowed);
  call.on("cancelled", () => {
    emitter.remove(call);
  });
}

module.exports = { subscribe };
