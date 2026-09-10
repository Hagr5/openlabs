#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATEWAY_PORT = process.env.GATEWAY_PORT || "4000";
const BASE = process.env.DUCKFLEET_URL || `http://localhost:${GATEWAY_PORT}`;

function makeElement() {
  const handlers = {};
  const classes = new Set();
  return {
    handlers,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    addEventListener: (type, fn) => {
      handlers[type] = handlers[type] || [];
      handlers[type].push(fn);
    },
    fire: async (type, ev) => {
      for (const fn of handlers[type] || []) await fn(ev);
    },
  };
}

const ids = [
  "view-login", "view-fleet", "login-form", "email", "password", "login-btn",
  "login-error", "session", "session-user", "session-role", "logout-btn",
  "fleet-rows", "updated-at",
];
const elements = Object.fromEntries(ids.map((id) => [id, makeElement()]));
for (const id of ["view-fleet", "login-error"]) elements[id].classList.add("hidden");

const store = {};
globalThis.window = globalThis;
globalThis.document = { getElementById: (id) => elements[id] || null };
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const vendorLib = path.join(ROOT, "gateway/public/vendor/protobuf.min.js");
const moduleLib = path.join(ROOT, "gateway/node_modules/protobufjs/dist/protobuf.min.js");
globalThis.protobuf = require(fs.existsSync(vendorLib) ? vendorLib : moduleLib);
const nodeFetch = globalThis.fetch;
globalThis.fetch = (url, init) =>
  nodeFetch(typeof url === "string" && url.startsWith("/") ? `${BASE}${url}` : url, init);

const failures = [];
function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"} [spa] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures.push(name);
}

const descriptors = await (await fetch(`${BASE}/descriptors.js`)).text();
const app = await (await fetch(`${BASE}/app.js`)).text();
check("assets", descriptors.includes("DUCKFLEET_PUBLIC_DESCRIPTORS") && app.includes("grpcCall") + app.includes("apiLogin") > 0, "console scripts served");

eval(descriptors);
check("descriptors", !!globalThis.DUCKFLEET_PUBLIC_DESCRIPTORS?.nested?.auth, "public descriptors load");
eval(app);

check("initial", elements["view-fleet"].classList.contains("hidden") && !elements["view-login"].classList.contains("hidden"), "login view shown first");

elements.email.value = "dispatch@duckurity.example";
elements.password.value = "fleetflow-2024";
try {
  await elements["login-form"].fire("submit", { preventDefault: () => {} });
} catch (err) {
  console.log(`submit threw: ${err.stack}`);
}
await new Promise((r) => setTimeout(r, 3000));

check("login", !!store["duckfleet.session"] && store["duckfleet.session"].length > 50, "session token stored");
check("session", elements.session.classList.contains("visible"), "session chip visible");
check("fleet", !elements["view-fleet"].classList.contains("hidden"), "fleet view shown");
check("rows", (elements["fleet-rows"].innerHTML.match(/<tr>/g) || []).length === 12, "12 vehicle rows rendered");
check("user", elements["session-user"].textContent.includes("dispatch@duckurity.example"), "user chip shows email");

const firstRender = elements["fleet-rows"].innerHTML;
await new Promise((r) => setTimeout(r, 12000));
check("poll", elements["updated-at"].textContent.includes("units"), "auto-refresh ticked");

await elements["logout-btn"].fire("click", {});
check("logout", !store["duckfleet.session"] && !elements.session.classList.contains("visible"), "sign out clears session");

if (failures.length > 0) {
  console.error(`SPA SMOKE FAILED: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("SPA SMOKE PASSED");
process.exit(0);
