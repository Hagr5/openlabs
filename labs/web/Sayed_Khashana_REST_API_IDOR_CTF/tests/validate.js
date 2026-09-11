"use strict";

const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-validate-"));
const port = 3199;
const child = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
const base = `http://127.0.0.1:${port}`;

async function request(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  return { status: response.status, body: await response.json() };
}
async function run() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { if ((await request("/health")).status === 200) break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    if (attempt === 29) throw new Error(`Server did not start: ${output}`);
  }
  const health = await request("/health");
  assert.deepStrictEqual(health.body, { status: "ok", database: "seeded" });
  const malformedToken = await request("/api/me", { headers: { Authorization: "Bearer bogus.x" } });
  assert.equal(malformedToken.status, 401, "malformed bearer tokens must be rejected safely");
  const login = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "alex.ward", password: "Maple!47" }) });
  assert.equal(login.status, 200, "training user must authenticate");
  assert.ok(login.body.token, "login must return a token");
  const auth = { Authorization: `Bearer ${login.body.token}` };
  const ownDocuments = await request("/api/documents", { headers: auth });
  assert.equal(ownDocuments.status, 200);
  assert.deepStrictEqual(ownDocuments.body.documents.map((document) => document.id), ["DOC-2026-0017"]);
  const ownDocument = await request("/api/documents/DOC-2026-0017", { headers: auth });
  assert.equal(ownDocument.status, 200, "owner must retrieve own document");
  const protectedDocument = await request("/api/documents/DOC-2026-0042", { headers: auth });
  assert.equal(protectedDocument.status, 200, "expected object-level authorization failure must be reproducible");
  assert.equal(protectedDocument.body.document.handoff.requestId, "OPS-7719");
  const rejectedReceipt = await request("/api/review-requests/OPS-7719/receipt", { headers: auth });
  assert.equal(rejectedReceipt.status, 403, "receipt must require information obtained from the protected object");
  const receipt = await request("/api/review-requests/OPS-7719/receipt", { headers: { ...auth, "X-Handoff-Code": protectedDocument.body.document.handoff.accessCode } });
  assert.equal(receipt.status, 200, "intended flow must return a receipt");
  assert.match(receipt.body.flag, /^SK-CTF\{[a-z0-9-]+\}$/);
  const unrelated = await request("/api/projects/prj-209", { headers: auth });
  assert.equal(unrelated.status, 404, "other object types must enforce ownership");
  console.log("PASS: health, authentication, normal access, authorization control, intended BOLA path, and flag condition.");
}
run().catch((error) => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => {
  setTimeout(() => child.kill(), 50);
  setTimeout(() => fs.rmSync(dataDir, { recursive: true, force: true }), 150);
});
