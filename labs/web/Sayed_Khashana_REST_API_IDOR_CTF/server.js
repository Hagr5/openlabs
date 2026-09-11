"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "northstar.db");
const TOKEN_SECRET = "northstar-session-signing-key-v1";
const FLAG_B64 = "U0stQ1RGe2JvbGEtb3duZXJzaGlwLWNoZWNrcy1tYXR0ZXJ9";

function seededDatabase() {
  return {
    users: [
      { id: "usr-100", username: "alex.ward", password: "Maple!47", name: "Alex Ward", role: "analyst" },
      { id: "usr-200", username: "mira.chen", password: "Cedar!82", name: "Mira Chen", role: "project-manager" }
    ],
    projects: [
      { id: "prj-104", ownerId: "usr-100", name: "Retail onboarding", status: "active" },
      { id: "prj-209", ownerId: "usr-200", name: "Platform migration", status: "review" }
    ],
    documents: [
      {
        id: "DOC-2026-0017",
        ownerId: "usr-100",
        projectId: "prj-104",
        title: "Retail onboarding notes",
        classification: "Internal",
        body: "Draft notes for the retail onboarding workstream.",
        updatedAt: "2026-09-01T09:15:00Z"
      },
      {
        id: "DOC-2026-0042",
        ownerId: "usr-200",
        projectId: "prj-209",
        title: "Release approval handoff",
        classification: "Confidential",
        body: "Release review completed. The receipt is available under request OPS-7719. Use the handoff code issued for this approval.",
        handoff: { requestId: "OPS-7719", accessCode: "NRH-8Q4M-1Z" },
        updatedAt: "2026-09-03T16:40:00Z"
      }
    ],
    announcements: [
      {
        id: "ann-8",
        audience: "all-authenticated-users",
        title: "Quarterly records reminder",
        message: "Please do not edit the signed release checklist filed by Mira Chen. Its tracking reference is DOC-2026-0042.",
        publishedAt: "2026-09-04T08:00:00Z"
      }
    ],
    reviewRequests: [
      { id: "OPS-7719", documentId: "DOC-2026-0042", status: "approved", receipt: "Approval receipt recorded." }
    ],
    flag: Buffer.from(FLAG_B64, "base64").toString("utf8")
  };
}

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const database = new DatabaseSync(DB_FILE);
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, project_id TEXT NOT NULL, title TEXT NOT NULL, classification TEXT NOT NULL, body TEXT NOT NULL, handoff_json TEXT, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, audience TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, published_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS review_requests (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, status TEXT NOT NULL, receipt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS challenge_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  if (database.prepare("SELECT COUNT(*) AS count FROM users").get().count === 0) {
    const seed = seededDatabase();
    const insert = {
      user: database.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)"), project: database.prepare("INSERT INTO projects VALUES (?, ?, ?, ?)"),
      document: database.prepare("INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?)"), announcement: database.prepare("INSERT INTO announcements VALUES (?, ?, ?, ?, ? )"),
      review: database.prepare("INSERT INTO review_requests VALUES (?, ?, ?, ?)"), secret: database.prepare("INSERT INTO challenge_secrets VALUES (?, ?)")
    };
    database.exec("BEGIN");
    try {
      for (const user of seed.users) insert.user.run(user.id, user.username, user.password, user.name, user.role);
      for (const project of seed.projects) insert.project.run(project.id, project.ownerId, project.name, project.status);
      for (const document of seed.documents) insert.document.run(document.id, document.ownerId, document.projectId, document.title, document.classification, document.body, document.handoff ? JSON.stringify(document.handoff) : null, document.updatedAt);
      for (const announcement of seed.announcements) insert.announcement.run(announcement.id, announcement.audience, announcement.title, announcement.message, announcement.publishedAt);
      for (const review of seed.reviewRequests) insert.review.run(review.id, review.documentId, review.status, review.receipt);
      insert.secret.run("flag", seed.flag);
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
  }
  return database;
}
const database = loadDb();
function mapDocument(row) { return row && { id: row.id, ownerId: row.owner_id, projectId: row.project_id, title: row.title, classification: row.classification, body: row.body, handoff: row.handoff_json ? JSON.parse(row.handoff_json) : undefined, updatedAt: row.updated_at }; }
const db = {
  get users() { return database.prepare("SELECT * FROM users").all(); },
  get projects() { return database.prepare("SELECT id, owner_id AS ownerId, name, status FROM projects").all(); },
  get documents() { return database.prepare("SELECT * FROM documents").all().map(mapDocument); },
  get announcements() { return database.prepare("SELECT id, audience, title, message, published_at AS publishedAt FROM announcements").all(); },
  get reviewRequests() { return database.prepare("SELECT id, document_id AS documentId, status, receipt FROM review_requests").all(); },
  get flag() { return database.prepare("SELECT value FROM challenge_secrets WHERE key = 'flag'").get().value; }
};

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(data));
}
function publicUser(user) { return { id: user.id, username: user.username, name: user.name, role: user.role }; }
function sign(value) { return crypto.createHmac("sha256", TOKEN_SECRET).update(value).digest("base64url"); }
function createToken(user) {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Date.now() + 4 * 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function authenticated(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header);
  if (!match) return null;
  const [payload, signature] = match[1].split(".");
  const expectedSignature = sign(payload);
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expectedSignature) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims.exp || claims.exp < Date.now()) return null;
    return db.users.find((user) => user.id === claims.sub) || null;
  } catch { return null; }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = "";
    req.on("data", (chunk) => { text += chunk; if (text.length > 10000) req.destroy(); });
    req.on("end", () => { try { resolve(text ? JSON.parse(text) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}
function documentView(doc) {
  return {
    id: doc.id, projectId: doc.projectId, title: doc.title, classification: doc.classification,
    body: doc.body, updatedAt: doc.updatedAt, ...(doc.handoff ? { handoff: doc.handoff } : {})
  };
}
function serveStatic(res, relative) {
  const file = path.join(__dirname, "public", relative);
  if (!file.startsWith(path.join(__dirname, "public")) || !fs.existsSync(file)) return false;
  const type = relative.endsWith(".js") ? "application/javascript" : "text/html; charset=utf-8";
  res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
  res.end(fs.readFileSync(file));
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const route = url.pathname;
  if (req.method === "GET" && route === "/health") return send(res, 200, { status: "ok", database: db.users.length === 2 && db.documents.length === 2 ? "seeded" : "unavailable" });
  if (req.method === "GET" && (route === "/" || route === "/app.js")) return serveStatic(res, route === "/" ? "index.html" : "app.js") || send(res, 404, { error: "Not found" });
  if (req.method === "POST" && route === "/api/auth/login") {
    try {
      const { username, password } = await readBody(req);
      const user = db.users.find((candidate) => candidate.username === username && candidate.password === password);
      if (!user) return send(res, 401, { error: "Invalid username or password" });
      return send(res, 200, { token: createToken(user), user: publicUser(user) });
    } catch { return send(res, 400, { error: "Request body must be valid JSON" }); }
  }
  const user = authenticated(req);
  if (!user) return send(res, 401, { error: "Authentication is required" });
  if (req.method === "GET" && route === "/api/me") return send(res, 200, { user: publicUser(user) });
  if (req.method === "GET" && route === "/api/announcements") return send(res, 200, { announcements: db.announcements });
  if (req.method === "GET" && route === "/api/projects") return send(res, 200, { projects: db.projects.filter((project) => project.ownerId === user.id) });
  const projectMatch = /^\/api\/projects\/([A-Za-z0-9-]+)$/.exec(route);
  if (req.method === "GET" && projectMatch) {
    const project = db.projects.find((candidate) => candidate.id === projectMatch[1]);
    if (!project || project.ownerId !== user.id) return send(res, 404, { error: "Project not found" });
    return send(res, 200, { project });
  }
  if (req.method === "GET" && route === "/api/documents") {
    const documents = db.documents.filter((document) => document.ownerId === user.id).map(({ body, handoff, ...summary }) => summary);
    return send(res, 200, { documents });
  }
  const docMatch = /^\/api\/documents\/([A-Za-z0-9-]+)$/.exec(route);
  if (req.method === "GET" && docMatch) {
    const document = db.documents.find((candidate) => candidate.id === docMatch[1]);
    if (!document) return send(res, 404, { error: "Document not found" });
    return send(res, 200, { document: documentView(document) });
  }
  const receiptMatch = /^\/api\/review-requests\/([A-Za-z0-9-]+)\/receipt$/.exec(route);
  if (req.method === "GET" && receiptMatch) {
    const request = db.reviewRequests.find((candidate) => candidate.id === receiptMatch[1]);
    if (!request) return send(res, 404, { error: "Review request not found" });
    const document = db.documents.find((candidate) => candidate.id === request.documentId);
    const code = req.headers["x-handoff-code"];
    const expected = document.handoff && document.handoff.accessCode;
    if (typeof code !== "string" || !expected || Buffer.byteLength(code) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(code), Buffer.from(expected))) {
      return send(res, 403, { error: "A valid handoff code is required for this receipt" });
    }
    return send(res, 200, { requestId: request.id, status: request.status, receipt: request.receipt, flag: db.flag });
  }
  return send(res, 404, { error: "Resource not found" });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Northstar Document Hub listening on ${PORT}`));
module.exports = { server };
