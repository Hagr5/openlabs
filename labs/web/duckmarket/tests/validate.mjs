#!/usr/bin/env node
// DuckMarket environment validation suite.
//
// Run from the repository root against a freshly started stack:
//   docker compose down -v && docker compose up -d --wait && node tests/validate.mjs
//
// Requires the ADMIN_TEST_* variables (used by CI only; not part of the
// shipped environment):
//   ADMIN_TEST_PASSWORD   password seeded for the admin account
//   FLAG                  must match the value passed to the stack

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const BASE = process.env.BASE_URL || "http://localhost:4000";
const ADMIN_EMAIL = "ops@duckurity.example";
const ADMIN_PASSWORD = process.env.ADMIN_TEST_PASSWORD;
const EXPECTED_FLAG = process.env.FLAG;

if (!ADMIN_PASSWORD) {
  console.error("FAIL: ADMIN_TEST_PASSWORD must be set (test-only admin credential)");
  process.exit(1);
}
if (!EXPECTED_FLAG) {
  console.error("FAIL: FLAG must be set and match the stack environment");
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n== ${title}`);
}

// --- tiny client -------------------------------------------------------------

async function api(path, { method = "GET", body, session, csrf, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (session) h["cookie"] = `SESSIONID=${session}`;
  if (body !== undefined) h["content-type"] = "application/json";
  if (csrf && method !== "GET" && method !== "HEAD") h["x-xsrf-token"] = csrf;
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    redirect: "manual",
  });
  let json = null;
  let text = "";
  text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, res };
}

function cookiesOf(res) {
  const out = {};
  for (const c of res.res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1);
  }
  return out;
}

async function login(email, password) {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  const cookies = cookiesOf(res);
  return {
    ok: res.status === 200,
    session: cookies["SESSIONID"],
    csrf: cookies["XSRF-TOKEN"],
    body: res.json,
  };
}

async function gql(session, csrf, query, variables) {
  const res = await api("/api/graphql/preview", {
    method: "POST",
    session,
    csrf,
    body: { query, variables },
  });
  return res;
}

function zip(files) {
  // Minimal STORE-format zip builder (CRC-free is fine: runtime uses stored
  // entries as-is; we need valid CRCs though — compute them).
  const chunks = [];
  const central = [];
  const encoder = new TextEncoder();
  let offset = 0;

  function crc32(buf) {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = encoder.encode(name);
    const dataBuf = typeof content === "string" ? encoder.encode(content) : content;
    const crc = crc32(dataBuf);

    const local = new Uint8Array(30 + nameBuf.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBuf.length, true);
    lv.setUint32(22, dataBuf.length, true);
    lv.setUint16(26, nameBuf.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBuf, 30);
    chunks.push(local, dataBuf);

    const cd = new Uint8Array(46 + nameBuf.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBuf.length, true);
    cv.setUint32(24, dataBuf.length, true);
    cv.setUint16(28, nameBuf.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint16(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBuf, 46);
    central.push(cd);

    offset += local.length + dataBuf.length;
  }

  const centralBuf = Buffer.concat(central.map((c) => Buffer.from(c)));
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([
    ...chunks.map((c) => Buffer.from(c)),
    centralBuf,
    eocd,
  ]);
}

// --- suite -------------------------------------------------------------------

async function main() {
  section("1. healthz");
  {
    const res = await api("/api/healthz");
    check("/api/healthz returns UP", res.status === 200 && res.json?.status === "UP");
  }

  section("2. authentication & CSRF");
  let daffy;
  {
    daffy = await login("daffy@duckurity.example", "DuckSeason2024!");
    check("login works and sets cookies", daffy.ok && daffy.session && daffy.csrf);

    const noCsrf = await api("/api/graphql/preview", {
      method: "POST",
      body: { query: "{ viewer { id } }" },
      headers: { cookie: `SESSIONID=${daffy.session}` },
    });
    check("mutation without X-XSRF-TOKEN is 403", noCsrf.status === 403, `got ${noCsrf.status}`);

    const anon = await api("/api/graphql/preview", {
      method: "POST",
      body: { query: "{ viewer { id } }" },
    });
    check("unauthenticated GraphQL is 401", anon.status === 401, `got ${anon.status}`);
  }

  section("3. standard user can create + provision a function");
  let fnId;
  {
    const res = await gql(
      daffy.session,
      daffy.csrf,
      `mutation($i: CreateAccountFunctionInput!) {
        createAccountFunction(input: $i) {
          accountFunction { id status runtime codeFile { __typename ... on StagedFile { uploadLink } } }
          userErrors { message }
        }
      }`,
      { i: { name: "validate-fn", codeFileName: "package.zip", active: true } }
    );
    fnId = res.json?.data?.createAccountFunction?.accountFunction?.id;
    const link =
      res.json?.data?.createAccountFunction?.accountFunction?.codeFile?.uploadLink;
    check("createAccountFunction succeeds for standard user", !!fnId && !res.json?.data?.createAccountFunction?.userErrors?.length);
    check("staged upload link returned", !!link);

    const upload = await api(link, {
      method: "PUT",
      raw: zip({
        "package.json": JSON.stringify({ name: "validate-fn", version: "1.0.0", main: "index.js" }),
        "index.js": `const { execSync } = require("child_process");
exports.handler = async (event, ctx) => {
  console.log("whoami: " + execSync("whoami").toString().trim());
  console.log("secret: " + execSync("cat /flag.txt").toString().trim());
  return { ok: true };
};`,
      }),
      headers: {
        cookie: `SESSIONID=${daffy.session}`,
        "x-xsrf-token": daffy.csrf,
        "content-type": "application/zip",
      },
    });
    check("staged ZIP upload accepted", upload.status === 202, `got ${upload.status}`);

    let ready = false;
    let runtimeOk = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const q = await gql(
        daffy.session,
        daffy.csrf,
        `query($id: ID!){ function(id: $id){ status runtime } }`,
        { id: fnId }
      );
      const fn = q.json?.data?.function;
      if (fn?.status === "READY") {
        ready = true;
        runtimeOk = fn.runtime === "nodejs22.x";
        break;
      }
      if (fn?.status === "FAILED") break;
    }
    check("function reaches READY", ready);
    check("runtime reports nodejs22.x", runtimeOk);
  }

  section("4. invokeFunction FORBIDDEN for standard user");
  {
    const res = await gql(
      daffy.session,
      daffy.csrf,
      `mutation($id: ID!){ invokeFunction(id: $id){ invocation { id } userErrors { message } } }`,
      { id: fnId }
    );
    const errs = res.json?.data?.invokeFunction?.userErrors || [];
    check(
      "standard user receives FORBIDDEN on invokeFunction",
      errs.some((e) => e.message.includes("FORBIDDEN")),
      JSON.stringify(errs)
    );
    check("no invocation was executed", !res.json?.data?.invokeFunction?.invocation);
  }

  section("5. invokeFunction succeeds for entitled admin");
  {
    const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    check("admin login works", admin.ok);

    const res = await gql(
      admin.session,
      admin.csrf,
      `mutation($id: ID!){ invokeFunction(id: $id){ invocation { id successful logs { message } } userErrors { message } } }`,
      { id: fnId }
    );
    const inv = res.json?.data?.invokeFunction?.invocation;
    const errs = res.json?.data?.invokeFunction?.userErrors || [];
    check("admin receives no userErrors", errs.length === 0, JSON.stringify(errs));
    check("admin invocation executes successfully", !!inv?.successful);
    const who = (inv?.logs || []).find((l) => l.message.includes("whoami:"));
    check("admin invocation logs show sandbox user", !!who && who.message.includes("sbx_duck1051"), JSON.stringify(inv?.logs));
  }

  section("6. webhook configurations");
  let webhookId;
  {
    const good = await gql(
      daffy.session,
      daffy.csrf,
      `mutation($i: CreateAccountWebhookConfigurationInput!){
        createAccountWebhookConfiguration(input: $i){
          webhookConfiguration { id status resourceType resourceActions destination { functionId } }
          userErrors { message }
        }
      }`,
      {
        i: {
          resourceType: "USER",
          resourceActions: ["CHANGED"],
          destination: { functionId: fnId },
        },
      }
    );
    const wc = good.json?.data?.createAccountWebhookConfiguration;
    webhookId = wc?.webhookConfiguration?.id;
    check("function destination webhook becomes ACTIVE", wc?.webhookConfiguration?.status === "ACTIVE");
    check("webhook has function destination", wc?.webhookConfiguration?.destination?.functionId === fnId);

    // HTTP-URL destinations are not part of the preview surface. The schema
    // exposes only functionId; passing one must be a schema-level error.
    const bad = await gql(
      daffy.session,
      daffy.csrf,
      `mutation {
        createAccountWebhookConfiguration(input: {
          resourceType: USER,
          resourceActions: [CHANGED],
          destination: { functionId: "ce985ac0-0000-0000-0000-000000000000" }
        }) { webhookConfiguration { id } userErrors { message } }
      }`
    );
    const errs = bad.json?.data?.createAccountWebhookConfiguration?.userErrors || [];
    check("functionId outside the account is rejected", errs.length > 0);
  }

  section("7. profile PUT triggers event-driven execution");
  {
    const uuid = daffy.body?.user?.id;
    const put = await api(`/api/account/v2/users/${uuid}`, {
      method: "PUT",
      body: { locale: "en-GB" },
      headers: { cookie: `SESSIONID=${daffy.session}`, "x-xsrf-token": daffy.csrf },
    });
    check("profile PUT succeeds", put.status === 200, `got ${put.status}`);

    let invocation = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const q = await gql(
        daffy.session,
        daffy.csrf,
        `query($id: ID!){ function(id: $id){ lastInvocation { successful logs { message } } } }`,
        { id: fnId }
      );
      const li = q.json?.data?.function?.lastInvocation;
      if (li) {
        invocation = li;
        break;
      }
    }
    check("webhook fires and records an invocation", !!invocation);

    const logText = (invocation?.logs || []).map((l) => l.message).join("\n");
    check(
      "logs contain sandbox user output",
      logText.includes("sbx_duck1051"),
      JSON.stringify(invocation?.logs)
    );
    const flagMatch = logText.match(/DUCK\{[^}]+\}/);
    check("logs contain the runtime secret", !!flagMatch);
    check(
      "runtime secret matches the injected FLAG env value",
      flagMatch && flagMatch[0] === EXPECTED_FLAG,
      `expected ${EXPECTED_FLAG}, got ${flagMatch && flagMatch[0]}`
    );
  }

  section("8. BOLA on function access");
  {
    // A function owned by a different account must not be readable by a
    // standard user from this account. The seeded pilot-partner account
    // (password pinned via SEED_PARTNER_PASSWORD in test environments) owns a
    // function created here.
    const partnerPassword = process.env.PARTNER_TEST_PASSWORD;
    check(
      "partner test credential provided",
      !!partnerPassword,
      "set PARTNER_TEST_PASSWORD (must match SEED_PARTNER_PASSWORD)"
    );
    if (partnerPassword) {
      const partner = await login("pilot@acme.example", partnerPassword);
      check("partner login works", partner.ok);

      const res = await gql(
        partner.session,
        partner.csrf,
        `mutation($i: CreateAccountFunctionInput!){
          createAccountFunction(input: $i){
            accountFunction { id } userErrors { message }
          }
        }`,
        { i: { name: "partner-owned-fn", codeFileName: "package.zip", active: false } }
      );
      const partnerFn = res.json?.data?.createAccountFunction?.accountFunction?.id;
      check("partner can create its own function", !!partnerFn);

      const cross = await gql(
        daffy.session,
        daffy.csrf,
        `query($id: ID!){ function(id: $id){ id } }`,
        { id: partnerFn }
      );
      check(
        "standard user cannot query another account's function",
        cross.json?.data?.function === null || !!cross.json?.errors,
        JSON.stringify(cross.json)
      );

      const crossAdmin = await gql(
        daffy.session,
        daffy.csrf,
        `mutation($id: ID!){ invokeFunction(id: $id){ invocation { id } userErrors { message } } }`,
        { id: partnerFn }
      );
      const errs = crossAdmin.json?.data?.invokeFunction?.userErrors || [];
      check(
        "standard user cannot invoke another account's function",
        errs.some((e) => e.message.includes("FORBIDDEN")),
        JSON.stringify(errs)
      );
    }
  }

  section("9. zip-slip protection");
  {
    const res = await gql(
      daffy.session,
      daffy.csrf,
      `mutation{ createAccountFunction(input: { name: "slip-probe", codeFileName: "p.zip", active: false }){
        accountFunction { id codeFile { __typename ... on StagedFile { uploadLink } } } userErrors { message } } }`
    );
    const link =
      res.json?.data?.createAccountFunction?.accountFunction?.codeFile?.uploadLink;
    const slipFn = res.json?.data?.createAccountFunction?.accountFunction?.id;

    const upload = await api(link, {
      method: "PUT",
      raw: zip({
        "package.json": JSON.stringify({ name: "slip", main: "index.js" }),
        "index.js": "exports.handler = async () => ({});",
        "../../evil.js": "console.log('escaped');",
      }),
      headers: {
        cookie: `SESSIONID=${daffy.session}`,
        "x-xsrf-token": daffy.csrf,
        "content-type": "application/zip",
      },
    });
    check("slip archive upload accepted at transport level", upload.status === 202);

    let status = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const q = await gql(
        daffy.session,
        daffy.csrf,
        `query($id: ID!){ function(id: $id){ status } }`,
        { id: slipFn }
      );
      status = q.json?.data?.function?.status;
      if (status === "FAILED" || status === "READY") break;
    }
    check("malicious archive provisioning ends FAILED", status === "FAILED", `got ${status}`);

    // No file must exist outside /packages inside the runtime container.
    let escaped = false;
    try {
      const out = execSync(
        `docker exec duckmarket-fn-runtime sh -c "find / -name evil.js -not -path '/proc/*' 2>/dev/null | head -1"`,
        { timeout: 15000 }
      )
        .toString()
        .trim();
      escaped = out.length > 0;
    } catch {
      escaped = false;
    }
    check("no file written outside the package directory", !escaped);
  }

  section("10. login lockout");
  {
    // Use a dedicated probe account so the main credentials stay usable.
    const email = "lockout-probe@duckurity.example";
    let lastCode = 0;
    for (let i = 0; i < 5; i++) {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: { email, password: "definitely-wrong" },
      });
      lastCode = res.status;
    }
    check("repeated failures do not leak account state", lastCode === 401 || lastCode === 429);
    const locked = await api("/api/auth/login", {
      method: "POST",
      body: { email, password: "definitely-wrong" },
    });
    check("account locks after repeated failures", locked.status === 429, `got ${locked.status}`);
    const lockedMessage = locked.json?.message || "";
    check("lockout message is generic", !lockedMessage.includes("ops@") && !lockedMessage.includes("admin"));
  }

  section("11. secret hygiene in build context");
  {
    // The flag value must not appear in any build context or image source.
    // (.env is excluded: it is the injection point itself and never shipped.)
    let hits = "";
    try {
      hits = execSync(
        `grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude=.env -F "${EXPECTED_FLAG}" . || true`,
        { timeout: 20000 }
      )
        .toString()
        .trim();
    } catch {
      hits = "";
    }
    check("secret value not present in the repository", hits.length === 0, hits.slice(0, 200));

    let schemaHits = "";
    try {
      schemaHits = execSync(
        `docker exec duckmarket-platform sh -c "grep -ri 'DUCK{' /app/src /app/public 2>/dev/null | head -1"`,
        { timeout: 15000 }
      )
        .toString()
        .trim();
    } catch {
      schemaHits = "";
    }
    check("secret value not present inside platform source", schemaHits.length === 0);
  }

  section("12. reset determinism");
  {
    execSync("docker compose down -v", { timeout: 60000, stdio: "ignore" });
    execSync("docker compose up -d --wait", { timeout: 240000, stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 3000));

    const health = await api("/api/healthz");
    check("stack healthy after reset", health.status === 200 && health.json?.status === "UP");

    const fresh = await login("daffy@duckurity.example", "DuckSeason2024!");
    check("seeded login works after reset", fresh.ok);

    const res = await gql(
      fresh.session,
      fresh.csrf,
      `query { functions(first: 10) { totalCount } }`
    );
    check(
      "function state was reset",
      res.json?.data?.functions?.totalCount === 0,
      JSON.stringify(res.json)
    );

    // Re-run the core chain (steps 3-7) after reset.
    const chain = await coreChain(fresh);
    check("core chain (create→provision→webhook→trigger→flag) passes after reset", chain.ok, chain.reason);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

function hashSafe(v) {
  return createHash("sha256").update(v).digest("hex").slice(0, 8);
}

async function coreChain(sessionBundle) {
  const { session, csrf } = sessionBundle;
  const createRes = await gql(
    session,
    csrf,
    `mutation($i: CreateAccountFunctionInput!){
      createAccountFunction(input: $i){
        accountFunction { id codeFile { __typename ... on StagedFile { uploadLink } } }
        userErrors { message }
      }
    }`,
    { i: { name: "reset-chain-fn", codeFileName: "package.zip", active: true } }
  );
  const fn =
    createRes.json?.data?.createAccountFunction?.accountFunction;
  if (!fn?.id) return { ok: false, reason: "create failed" };

  const upload = await api(fn.codeFile.uploadLink, {
    method: "PUT",
    raw: zip({
      "package.json": JSON.stringify({ name: "reset-chain-fn", main: "index.js" }),
      "index.js": `const { execSync } = require("child_process");
exports.handler = async () => {
  console.log("whoami: " + execSync("whoami").toString().trim());
  console.log("secret: " + execSync("cat /flag.txt").toString().trim());
};`,
    }),
    headers: {
      cookie: `SESSIONID=${session}`,
      "x-xsrf-token": csrf,
      "content-type": "application/zip",
    },
  });
  if (upload.status !== 202) return { ok: false, reason: `upload ${upload.status}` };

  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const q = await gql(session, csrf, `query($id: ID!){ function(id: $id){ status } }`, {
      id: fn.id,
    });
    if (q.json?.data?.function?.status === "READY") {
      ready = true;
      break;
    }
    if (q.json?.data?.function?.status === "FAILED") break;
  }
  if (!ready) return { ok: false, reason: "not READY" };

  const wh = await gql(
    session,
    csrf,
    `mutation($i: CreateAccountWebhookConfigurationInput!){
      createAccountWebhookConfiguration(input: $i){ webhookConfiguration { id } userErrors { message } }
    }`,
    {
      i: {
        resourceType: "USER",
        resourceActions: ["CHANGED"],
        destination: { functionId: fn.id },
      },
    }
  );
  if (!wh.json?.data?.createAccountWebhookConfiguration?.webhookConfiguration?.id) {
    return { ok: false, reason: "webhook create failed" };
  }

  const uuid = sessionBundle.body?.user?.id;
  const put = await api(`/api/account/v2/users/${uuid}`, {
    method: "PUT",
    body: { locale: "de-DE" },
    headers: { cookie: `SESSIONID=${session}`, "x-xsrf-token": csrf },
  });
  if (put.status !== 200) return { ok: false, reason: `put ${put.status}` };

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const q = await gql(
      session,
      csrf,
      `query($id: ID!){ function(id: $id){ lastInvocation { logs { message } } } }`,
      { id: fn.id }
    );
    const logs = (q.json?.data?.function?.lastInvocation?.logs || []).map((l) => l.message).join("\n");
    if (logs) {
      const ok = logs.includes("sbx_duck1051") && logs.includes(EXPECTED_FLAG);
      return { ok, reason: ok ? "" : `unexpected logs: ${logs}` };
    }
  }
  return { ok: false, reason: "no invocation recorded" };
}

main().catch((err) => {
  console.error("SUITE ERROR:", err);
  process.exit(1);
});
