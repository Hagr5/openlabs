#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROTOS = path.join(ROOT, "protos");
const GATEWAY_PORT = process.env.GATEWAY_PORT || "4000";
const BASE = process.env.DUCKFLEET_URL || `http://localhost:${GATEWAY_PORT}`;
const CT_TEXT = "application/grpc-web-text+proto";
const CT_BIN = "application/grpc-web+proto";

const DISPATCH_EMAIL = "dispatch@duckurity.example";
const DISPATCH_PASSWORD = "fleetflow-2024";
const ADMIN_EMAIL = "ops-admin@duckurity.example";

let failures = 0;

function pass(step, detail) {
  console.log(`PASS [${step}] ${detail}`);
}

function fail(step, detail) {
  failures += 1;
  console.log(`FAIL [${step}] ${detail}`);
  throw new Error(`validation step failed: ${step}: ${detail}`);
}

function assertTrue(step, cond, detail) {
  if (!cond) fail(step, detail);
}

async function compose(...args) {
  return execFileAsync("docker", ["compose", ...args], { cwd: ROOT, env: process.env });
}

function readDotEnv() {
  const env = {};
  const envFile = path.join(ROOT, ".env");
  if (!fs.existsSync(envFile)) return env;
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function ensureEnv() {
  const envFile = path.join(ROOT, ".env");
  if (!fs.existsSync(envFile)) {
    const flag = `DUCK{validate-${crypto.randomBytes(8).toString("hex")}}`;
    fs.writeFileSync(envFile, `FLAG=${flag}\nSESSION_SECRET=\n`);
    console.log("created .env with a random FLAG for validation");
  }
  const fromEnv = readDotEnv();
  const flag = process.env.FLAG || fromEnv.FLAG;
  if (!flag) fail("env", ".env exists but FLAG is missing");
  return flag;
}

async function waitHealthy(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch (err) {
      // not up yet
    }
    if (Date.now() > deadline) fail("healthz", `gateway not healthy at ${BASE} within budget`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

function encodeFrame(payload) {
  const out = Buffer.allocUnsafe(5 + payload.length);
  out[0] = 0x00;
  out.writeUInt32BE(payload.length, 1);
  Buffer.from(payload).copy(out, 5);
  return out;
}

function parseTrailer(buf) {
  const result = { status: null, message: "" };
  for (const line of buf.toString("utf8").split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "grpc-status") result.status = Number.parseInt(value, 10);
    else if (key === "grpc-message") {
      try {
        result.message = decodeURIComponent(value);
      } catch {
        result.message = value;
      }
    }
  }
  return result;
}

function decodeFrames(buf) {
  const messages = [];
  let trailer = { status: null, message: "" };
  let offset = 0;
  while (offset < buf.length) {
    const flag = buf[offset];
    const length = buf.readUInt32BE(offset + 1);
    const payload = buf.subarray(offset + 5, offset + 5 + length);
    if (payload.length !== length) throw new Error("truncated frame from bridge");
    if (flag === 0x00) messages.push(Buffer.from(payload));
    else if (flag === 0x80) trailer = parseTrailer(Buffer.from(payload));
    else throw new Error(`unexpected frame type ${flag}`);
    offset += 5 + length;
  }
  return { messages, trailer };
}

async function unary(method, payload, { token, headers, contentType } = {}) {
  const body = encodeFrame(payload);
  const reqHeaders = { "content-type": contentType || CT_TEXT };
  if (token) reqHeaders.authorization = `Bearer ${token}`;
  Object.assign(reqHeaders, headers || {});
  const wire =
    (contentType || CT_TEXT) === CT_TEXT ? body.toString("base64") : body;
  const res = await fetch(`${BASE}/api/grpc/${method}`, {
    method: "POST",
    headers: reqHeaders,
    body: wire,
  });
  const respHeaders = {};
  for (const [k, v] of res.headers.entries()) respHeaders[k.toLowerCase()] = v;
  const raw =
    (contentType || CT_TEXT) === CT_TEXT
      ? Buffer.from(await res.text(), "base64")
      : Buffer.from(await res.arrayBuffer());
  const { messages, trailer } = decodeFrames(raw);
  return { httpStatus: res.status, messages, trailer, headers: respHeaders };
}

async function observe(method, payload, { token, headers, seconds, stopOn }) {
  const ctrl = new AbortController();
  const reqHeaders = { "content-type": CT_TEXT, connection: "close" };
  if (token) reqHeaders.authorization = `Bearer ${token}`;
  Object.assign(reqHeaders, headers || {});
  const res = await fetch(`${BASE}/api/grpc/${method}`, {
    method: "POST",
    headers: reqHeaders,
    body: encodeFrame(payload).toString("base64"),
    signal: ctrl.signal,
  });
  const respHeaders = {};
  for (const [k, v] of res.headers.entries()) respHeaders[k.toLowerCase()] = v;
  const events = [];
  let trailer = null;
  let stopped = false;
  const deadline = Date.now() + seconds * 1000;
  const killer = setTimeout(() => ctrl.abort(), seconds * 1000 + 5000);
  let b64buf = "";
  let binbuf = Buffer.alloc(0);
  try {
    for await (const chunk of res.body) {
      b64buf += Buffer.from(chunk).toString("ascii");
      const take = b64buf.length - (b64buf.length % 4);
      if (take > 0) {
        binbuf = Buffer.concat([binbuf, Buffer.from(b64buf.slice(0, take), "base64")]);
        b64buf = b64buf.slice(take);
      }
      while (binbuf.length >= 5) {
        const length = binbuf.readUInt32BE(1);
        if (binbuf.length < 5 + length) break;
        const flag = binbuf[0];
        const payloadBytes = binbuf.subarray(5, 5 + length);
        binbuf = binbuf.subarray(5 + length);
        if (flag === 0x00) {
          const event = Buffer.from(payloadBytes);
          events.push(event);
          if (stopOn && stopOn(event)) {
            stopped = true;
            ctrl.abort();
            break;
          }
        } else if (flag === 0x80) {
          trailer = parseTrailer(Buffer.from(payloadBytes));
        }
      }
      if (stopped || Date.now() > deadline) break;
    }
  } catch (err) {
    if (err.name !== "AbortError") throw err;
  } finally {
    clearTimeout(killer);
    try {
      await res.body.cancel();
    } catch {
      // already closed
    }
  }
  return { headers: respHeaders, events, trailer, httpStatus: res.status };
}

function jwtRole(token) {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role;
}

function forgeToken(header, payloadB64) {
  const sig = Buffer.from("invalid-signature").toString("base64url");
  return `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${payloadB64}.${sig}`;
}

let Types;

async function loadTypes() {
  const root = new protobuf.Root();
  root.loadSync(
    ["auth.proto", "fleet.proto", "events.proto", "admin.proto"].map((f) =>
      path.join(PROTOS, f)
    ),
    { keepCase: false }
  );
  root.resolveAll();
  Types = {
    LoginRequest: root.lookupType("auth.LoginRequest"),
    LoginResponse: root.lookupType("auth.LoginResponse"),
    UserInfo: root.lookupType("auth.UserInfo"),
    Empty: root.lookupType("google.protobuf.Empty"),
    ListVehiclesResponse: root.lookupType("fleet.ListVehiclesResponse"),
    SubscribeRequest: root.lookupType("events.SubscribeRequest"),
    PlatformEvent: root.lookupType("events.PlatformEvent"),
    SessionAudit: root.lookupType("events.SessionAudit"),
    IssueTokenRequest: root.lookupType("admin.IssueTokenRequest"),
    IssueTokenResponse: root.lookupType("admin.IssueTokenResponse"),
    FlagResponse: root.lookupType("admin.FlagResponse"),
    ServerReflectionRequest: null,
  };
  const reflectionRoot = new protobuf.Root();
  reflectionRoot.loadSync([path.join(PROTOS, "grpc/reflection/v1alpha/reflection.proto")], {
    keepCase: false,
  });
  reflectionRoot.resolveAll();
  Types.ServerReflectionRequest = reflectionRoot.lookupType(
    "grpc.reflection.v1alpha.ServerReflectionRequest"
  );
  Types.ServerReflectionResponse = reflectionRoot.lookupType(
    "grpc.reflection.v1alpha.ServerReflectionResponse"
  );
  const descriptorRoot = await protobuf.load(
    require.resolve("protobufjs/google/protobuf/descriptor.proto")
  );
  Types.FileDescriptorProto = descriptorRoot.lookupType("google.protobuf.FileDescriptorProto");
}

function enc(type, obj) {
  return Buffer.from(type.encode(type.fromObject(obj)).finish());
}

async function reflectionCall(obj) {
  const payload = enc(Types.ServerReflectionRequest, obj);
  const { messages, trailer } = await unary(
    "grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo",
    payload
  );
  assertTrue("reflection", trailer.status === 0, `reflection trailer ${trailer.status}`);
  assertTrue("reflection", messages.length >= 1, "reflection returned no DATA frame");
  return Types.ServerReflectionResponse.decode(messages[0]);
}

async function stepLogin() {
  const payload = enc(Types.LoginRequest, { email: DISPATCH_EMAIL, password: DISPATCH_PASSWORD });
  const bin = await unary("auth.AuthService/Login", payload, { contentType: CT_BIN });
  assertTrue("login", bin.trailer.status === 0, "binary login failed");
  const text = await unary("auth.AuthService/Login", payload);
  assertTrue("login", text.trailer.status === 0, `login failed: ${text.trailer.status}`);
  const login = Types.LoginResponse.decode(text.messages[0]);
  assertTrue("login", typeof login.token === "string" && login.token.length > 50, "no token");
  assertTrue("login", jwtRole(login.token) === "USER", "dispatch token must carry USER role");
  const me = await unary("auth.AuthService/WhoAmI", enc(Types.Empty, {}), { token: login.token });
  assertTrue("login", me.trailer.status === 0, "WhoAmI failed");
  const info = Types.UserInfo.decode(me.messages[0]);
  assertTrue("login", info.email === DISPATCH_EMAIL && info.role === "USER", "WhoAmI mismatch");
  pass("login", `USER token for ${info.email} (WhoAmI OK)`);
  return { token: login.token, userId: info.userId };
}

async function stepReflection() {
  const listed = await reflectionCall({ host: "validator", listServices: "" });
  const names = (listed.listServicesResponse?.service || []).map((s) => s.name);
  for (const expected of [
    "auth.AuthService",
    "fleet.FleetService",
    "events.EventService",
    "admin.AdminService",
    "grpc.health.v1.Health",
    "grpc.reflection.v1alpha.ServerReflection",
  ]) {
    assertTrue("reflection", names.includes(expected), `service missing: ${expected}`);
  }
  const fileResp = await reflectionCall({ host: "validator", fileContainingSymbol: "admin.AdminService" });
  const blobs = fileResp.fileDescriptorResponse?.fileDescriptorProto || [];
  assertTrue("reflection", blobs.length >= 1, "no descriptor bytes for admin.AdminService");
  const adminFile = blobs
    .map((b) => Types.FileDescriptorProto.decode(b))
    .find((f) => f.name === "admin.proto");
  assertTrue("reflection", !!adminFile, "admin.proto descriptor missing");
  const svc = (adminFile.service || []).find((s) => s.name === "AdminService");
  const methods = (svc?.method || []).map((m) => m.name);
  assertTrue("reflection", methods.includes("IssueToken"), "IssueToken absent from descriptor");
  assertTrue("reflection", methods.includes("GetFlag"), "GetFlag absent from descriptor");
  pass("reflection", `services listed; admin.AdminService descriptor exposes IssueToken/GetFlag`);
}

async function stepGetFlagDenied(userToken, adminId) {
  const empty = enc(Types.Empty, {});
  const denied = await unary("admin.AdminService/GetFlag", empty, { token: userToken });
  assertTrue("authz", denied.trailer.status === 7, `GetFlag USER must be 7, got ${denied.trailer.status}`);
  const spoofed = await unary("admin.AdminService/GetFlag", empty, {
    token: userToken,
    headers: { "x-user-id": adminId },
  });
  assertTrue("authz", spoofed.trailer.status === 7, "x-user-id spoof must still be 7");
  const noneAlg = forgeToken(
    { alg: "none", typ: "JWT" },
    Buffer.from(JSON.stringify({ sub: adminId, role: "ADMIN", exp: 9999999999 })).toString("base64url")
  );
  const forged = await unary("admin.AdminService/GetFlag", empty, { token: noneAlg });
  assertTrue("authz", forged.trailer.status === 16, `alg:none must be 16, got ${forged.trailer.status}`);
  const badSig = forgeToken(
    { alg: "HS256", typ: "JWT" },
    Buffer.from(JSON.stringify({ sub: adminId, role: "ADMIN", exp: 9999999999 })).toString("base64url")
  );
  const forged2 = await unary("admin.AdminService/GetFlag", empty, { token: badSig });
  assertTrue("authz", forged2.trailer.status === 16, `bad signature must be 16, got ${forged2.trailer.status}`);
  pass("authz", "GetFlag denies USER (7), spoofed x-user-id (7), alg:none (16), bad sig (16)");
}

async function stepSubscribePublic(userToken) {
  const payload = enc(Types.SubscribeRequest, { categories: ["AUDIT", "AUTH"] });
  const { headers, events } = await observe("events.EventService/Subscribe", payload, {
    token: userToken,
    seconds: 35,
  });
  assertTrue("events", headers["x-acl"] === "public", `expected x-acl public, got ${headers["x-acl"]}`);
  assertTrue("events", events.length >= 1, "expected heartbeat events on public feed");
  for (const raw of events) {
    const event = Types.PlatformEvent.decode(raw);
    assertTrue("events", Number(event.category) === 0, `public feed leaked category ${event.category}`);
  }
  pass("events", `downgraded to public: ${events.length} FLEET events, x-acl=public`);
}

async function stepSubscribeInternal(userToken) {
  const payload = enc(Types.SubscribeRequest, { categories: ["AUDIT", "AUTH"] });
  const { headers, events } = await observe("events.EventService/Subscribe", payload, {
    token: userToken,
    headers: { "x-internal-call": "true" },
    seconds: 35,
    stopOn: (raw) => raw.includes(Buffer.from(ADMIN_EMAIL)),
  });
  assertTrue("events", headers["x-acl"] === "internal", `expected x-acl internal, got ${headers["x-acl"]}`);
  let adminId = null;
  for (const raw of events) {
    const event = Types.PlatformEvent.decode(raw);
    if (Number(event.category) === 1) {
      try {
        const audit = Types.SessionAudit.decode(event.payload);
        if (audit.email === ADMIN_EMAIL) adminId = audit.userId;
      } catch {
        // not a session audit payload
      }
    }
  }
  assertTrue("events", !!adminId, "admin SessionAudit not observed within 35s");
  pass("events", `internal feed delivered admin audit (x-acl=internal)`);
  return adminId;
}

async function stepIssueToken(userToken, ownId, adminId, expectedFlag) {
  const noHeader = await unary(
    "admin.AdminService/IssueToken",
    enc(Types.IssueTokenRequest, { userId: ownId }),
    { token: userToken }
  );
  assertTrue("issue", noHeader.trailer.status === 7, `IssueToken w/o header must be 7, got ${noHeader.trailer.status}`);
  const noAuth = await unary(
    "admin.AdminService/IssueToken",
    enc(Types.IssueTokenRequest, { userId: ownId }),
    { headers: { "x-internal-call": "true" } }
  );
  assertTrue("issue", noAuth.trailer.status === 16, `IssueToken w/o auth must be 16, got ${noAuth.trailer.status}`);
  const badUser = await unary(
    "admin.AdminService/IssueToken",
    enc(Types.IssueTokenRequest, { userId: "00000000-0000-0000-0000-000000000000" }),
    { token: userToken, headers: { "x-internal-call": "true" } }
  );
  assertTrue("issue", badUser.trailer.status === 3, `IssueToken unknown user must be 3, got ${badUser.trailer.status}`);
  const own = await unary(
    "admin.AdminService/IssueToken",
    enc(Types.IssueTokenRequest, { userId: ownId }),
    { token: userToken, headers: { "x-internal-call": "true" } }
  );
  assertTrue("issue", own.trailer.status === 0, `IssueToken own id failed: ${own.trailer.status}`);
  const ownToken = Types.IssueTokenResponse.decode(own.messages[0]).token;
  assertTrue("issue", jwtRole(ownToken) === "USER", "own-id mint must stay USER");
  const admin = await unary(
    "admin.AdminService/IssueToken",
    enc(Types.IssueTokenRequest, { userId: adminId }),
    { token: userToken, headers: { "x-internal-call": "true" } }
  );
  assertTrue("issue", admin.trailer.status === 0, `IssueToken admin id failed: ${admin.trailer.status}`);
  const adminToken = Types.IssueTokenResponse.decode(admin.messages[0]).token;
  assertTrue("issue", jwtRole(adminToken) === "ADMIN", "admin-id mint must be ADMIN");
  const flagCall = await unary("admin.AdminService/GetFlag", enc(Types.Empty, {}), {
    token: adminToken,
  });
  assertTrue("issue", flagCall.trailer.status === 0, `GetFlag ADMIN failed: ${flagCall.trailer.status}`);
  const flagResp = Types.FlagResponse.decode(flagCall.messages[0]);
  assertTrue("issue", flagResp.flag === expectedFlag, "returned flag does not match FLAG env");
  pass("issue", "IssueToken matrix OK; GetFlag with ADMIN token returns FLAG env value");
}

async function stepSpa() {
  const index = await (await fetch(`${BASE}/`)).text();
  assertTrue("spa", index.includes("DuckFleet"), "index does not look like the console");
  const scripts = [...index.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assertTrue("spa", scripts.length >= 1, "no bundled scripts found");
  let bundle = "";
  for (const src of scripts) {
    const url = src.startsWith("http") ? src : `${BASE}${src}`;
    bundle += `\n${await (await fetch(url)).text()}`;
  }
  for (const marker of ["AuthService", "LoginRequest", "FleetService", "ListVehicles"]) {
    assertTrue("spa", bundle.includes(marker), `bundle missing public descriptor ${marker}`);
  }
  for (const marker of ["AdminService", "EventService", "IssueToken", "SessionAudit", "GetFlag"]) {
    assertTrue("spa", !bundle.includes(marker), `bundle leaks internal descriptor ${marker}`);
  }
  pass("spa", "console served; bundle has auth/fleet descriptors, no admin/events");
}

async function stepContentType() {
  const res = await fetch(`${BASE}/api/grpc/auth.AuthService/Login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assertTrue("bridge", res.status === 415, `wrong content type must be 415, got ${res.status}`);
  pass("bridge", "non-proto content type rejected with 415");
}

async function stepBackendUnpublished() {
  let portFailed = false;
  try {
    await compose("port", "backend", "50051");
  } catch {
    portFailed = true;
  }
  assertTrue("network", portFailed, "backend port 50051 must not be published");
  const config = (await compose("config")).stdout;
  const backendSection = config.split(/^  gateway:/m)[0];
  assertTrue("network", !/ports:/m.test(backendSection), "backend service must declare no ports");
  pass("network", "backend gRPC port is internal-only");
}

async function stepFlagGrep(flag) {
  const args = [
    "-r",
    "-F",
    "--exclude-dir=node_modules",
    "--exclude-dir=.git",
    "--exclude=.env",
    "-e",
    flag,
    ".",
  ];
  let matches = "";
  try {
    await execFileAsync("grep", args, { cwd: ROOT });
  } catch (err) {
    if (err.code === 1) {
      pass("secret", "flag value absent from build context");
      return;
    }
    throw err;
  }
  matches = "?";
  fail("secret", `flag value found in build context: ${matches}`);
}

async function functionalCore(flag) {
  const { token, userId } = await stepLogin();
  await stepReflection();
  await stepGetFlagDenied(token, "e85bbf46-7fcd-4c9e-b5b4-33a6fcd8b945");
  await stepSubscribePublic(token);
  const adminId = await stepSubscribeInternal(token);
  await stepIssueToken(token, userId, adminId, flag);
}

async function main() {
  const flag = ensureEnv();
  await loadTypes();
  console.log(`validating ${BASE}`);

  console.log("bringing up a clean stack...");
  await compose("down", "-v").catch(() => {});
  await compose("up", "-d");
  await waitHealthy(180000);
  pass("healthz", `${BASE}/healthz OK`);

  await stepSpa();
  await stepContentType();
  const { token, userId } = await stepLogin();
  await stepReflection();
  await stepGetFlagDenied(token, "e85bbf46-7fcd-4c9e-b5b4-33a6fcd8b945");
  await stepSubscribePublic(token);
  const adminId = await stepSubscribeInternal(token);
  await stepIssueToken(token, userId, adminId, flag);
  await stepBackendUnpublished();
  await stepFlagGrep(flag);

  console.log("resetting (down -v, up -d) and re-running core chain...");
  await compose("down", "-v");
  await compose("up", "-d");
  await waitHealthy(180000);
  await functionalCore(flag);

  console.log("ALL CHECKS PASSED");
}

main().catch((err) => {
  console.error(`VALIDATION FAILED: ${err.message}`);
  process.exit(1);
});
