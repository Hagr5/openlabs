#!/usr/bin/env node
/**
 * DuckDesk — Automated Validation Suite
 * Runs from inside the Docker container after seeding.
 */

import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000/graphql';
const HEALTH_URL = process.env.HEALTH_URL || 'http://localhost:4000/healthz';
const DB_PATH = process.env.DB_PATH || '/data/duckdesk.db';
const FLAG = process.env.INCIDENT_RESPONSE_CODE;
if (!FLAG) {
  console.error('ERROR: Set the INCIDENT_RESPONSE_CODE environment variable before running validation.');
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
    failures.push(message);
  }
}

async function graphqlQuery(query, variables = {}, headers = {}) {
  const body = JSON.stringify({ query, variables });
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  });
  return res.json();
}

// ============================================================
// TEST 1: Health check
// ============================================================
console.log('\n[TEST 1] Health check');
try {
  const healthRes = await fetch(HEALTH_URL);
  assert(healthRes.ok === true, 'GET /healthz returns 200 OK');
  const healthData = await healthRes.json();
  assert(healthData.status === 'ok', '/healthz returns {"status":"ok"}');
} catch (e) {
  assert(false, `Health check failed: ${e.message}`);
}

// ============================================================
// TEST 2: Introspection contains AgentFilter.passwordHash
// ============================================================
console.log('\n[TEST 2] Schema introspection');
const introspectQuery = `
  query Introspect {
    __schema {
      types { name kind inputFields { name type { name kind ofType { name kind } } } }
    }
  }
`;
try {
  const result = await graphqlQuery(introspectQuery);
  assert(!result.errors, 'Introspection query succeeds');

  const types = result.data?.__schema?.types || [];
  const agentFilterInput = types.find(i => i.name === 'AgentFilter' && i.kind === 'INPUT_OBJECT');
  assert(agentFilterInput !== undefined, 'AgentFilter input type exists in schema');

  if (agentFilterInput) {
    const passwordHashField = agentFilterInput.inputFields?.find(f => f.name === 'passwordHash');
    assert(passwordHashField !== undefined, 'AgentFilter has passwordHash field');
  }
} catch (e) {
  assert(false, `Introspection failed: ${e.message}`);
}

// ============================================================
// TEST 3: Oracle check — read admin hash from DB, test oracle
// ============================================================
console.log('\n[TEST 3] Blind count oracle');
try {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Get the admin agent's actual password hash from DB
  const adminAgent = db.prepare("SELECT id, displayName, email, passwordHash FROM agents WHERE role = 'ADMIN'").get();
  assert(adminAgent !== undefined, 'Admin agent exists in database');
  assert(adminAgent.displayName === 'Drake Mallard', `Admin displayName is "Drake Mallard" (got "${adminAgent?.displayName}")`);

  const adminEmail = adminAgent.email;
  const trueHash = adminAgent.passwordHash;
  assert(trueHash.length === 32, `Admin password hash is 32 chars (MD5 hex) — got ${trueHash.length}`);

  // Test oracle with true prefix (should return headcount 1)
  const truePrefixResult = await graphqlQuery(
    'query TeamStats($f: AgentFilter) { teamStats(filter: $f) { headcount } }',
    { f: { displayName: { eq: adminAgent.displayName }, passwordHash: { startsWith: trueHash.substring(0, 16) } } }
  );
  assert(truePrefixResult.data?.teamStats?.headcount === 1, `Oracle with true prefix returns headcount=1 (got ${truePrefixResult.data?.teamStats?.headcount})`);

  // Test oracle with false prefix (should return headcount 0)
  const falseHash = '00000000000000000000000000000000';
  const falsePrefixResult = await graphqlQuery(
    'query TeamStats($f: AgentFilter) { teamStats(filter: $f) { headcount } }',
    { f: { displayName: { eq: adminAgent.displayName }, passwordHash: { startsWith: falseHash.substring(0, 16) } } }
  );
  assert(falsePrefixResult.data?.teamStats?.headcount === 0, `Oracle with false prefix returns headcount=0 (got ${falsePrefixResult.data?.teamStats?.headcount})`);

  db.close();
} catch (e) {
  assert(false, `Oracle check failed: ${e.message}`);
}

// ============================================================
// TEST 4: Wrong password login fails + lockout after 5 attempts
// ============================================================
console.log('\n[TEST 4] Login auth & lockout');
try {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Get a non-admin agent for testing
  const testAgent = db.prepare("SELECT email FROM agents WHERE role != 'ADMIN' AND isActive = 1 LIMIT 1").get();
  assert(testAgent !== undefined, 'Found a non-admin agent for login test');

  // Reset failed attempts first
  const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(testAgent.email);
  if (userId) {
    db.prepare('UPDATE users SET failedAttempts = 0, lockedUntil = NULL WHERE id = ?').run(userId.id);
  }

  // Attempt 5 wrong logins
  for (let i = 0; i < 5; i++) {
    const result = await graphqlQuery(
      'mutation Login($input: LoginInput!) { login(input: $input) { token viewer { id } } }',
      { input: { email: testAgent.email, password: `wrongpassword${i}` } }
    );
    assert(result.data?.login?.token === '', `Wrong password attempt ${i + 1}: no token returned`);
  }

  // 6th attempt should fail with lockout message
  const lockedResult = await graphqlQuery(
    'mutation Login($input: LoginInput!) { login(input: $input) { token viewer { id } } }',
    { input: { email: testAgent.email, password: 'wrongpassword5' } }
  );

  if (lockedResult.data?.login?.token === '') {
    assert(true, '6th attempt returns no token');
  } else {
    assert(false, '6th attempt should return no token');
  }

  db.close();
} catch (e) {
  assert(false, `Login lockout test failed: ${e.message}`);
}

// ============================================================
// TEST 5: Correct login returns a JWT token
// ============================================================
console.log('\n[TEST 5] Correct login');
try {
  // Reset the admin's attempts first
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  const adminUser = db.prepare("SELECT id FROM users WHERE email LIKE '%drake.mallard%'").get();
  if (adminUser) {
    db.prepare('UPDATE users SET failedAttempts = 0, lockedUntil = NULL WHERE id = ?').run(adminUser.id);
  }

  const adminAgent = db.prepare("SELECT email FROM agents WHERE role = 'ADMIN'").get();
  assert(adminAgent !== undefined, 'Admin agent exists');

  // Get the actual password hash and derive "donald"
  const adminHash = db.prepare("SELECT passwordHash FROM agents WHERE role = 'ADMIN'").get().passwordHash;
  const donaldHash = createHash('md5').update('donald').digest('hex');
  assert(donaldHash === adminHash, `Admin hash matches MD5("donald")`);

  db.close();

  // Login with correct password
  const loginResult = await graphqlQuery(
    'mutation Login($input: LoginInput!) { login(input: $input) { token viewer { displayName email role } } }',
    { input: { email: adminAgent.email, password: 'donald' } }
  );

  assert(loginResult.data?.login?.token !== '', 'Correct login returns a JWT token');
  assert(loginResult.data?.login?.viewer?.role === 'ADMIN', 'Viewer role is ADMIN after login');
} catch (e) {
  assert(false, `Correct login test failed: ${e.message}`);
}

// ============================================================
// TEST 6: Vault with admin token returns the FLAG
// ============================================================
console.log('\n[TEST 6] Admin vault access');
try {
  // Login as admin first to get a fresh token
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  const adminUser = db.prepare("SELECT id FROM users WHERE email LIKE '%drake.mallard%'").get();
  if (adminUser) {
    db.prepare('UPDATE users SET failedAttempts = 0, lockedUntil = NULL WHERE id = ?').run(adminUser.id);
  }

  const adminAgent = db.prepare("SELECT email FROM agents WHERE role = 'ADMIN'").get();
  const loginResult = await graphqlQuery(
    'mutation Login($input: LoginInput!) { login(input: $input) { token } }',
    { input: { email: adminAgent.email, password: 'donald' } }
  );

  const adminToken = loginResult.data?.login?.token;
  assert(adminToken !== '', 'Got admin JWT token');

  // Query vault with admin token
  const vaultResult = await graphqlQuery(
    'query GetVault { vault { key value } }',
    {},
    { Authorization: `Bearer ${adminToken}` }
  );

  const vaultEntries = vaultResult.data?.vault || [];
  assert(vaultEntries.length > 0, 'Admin vault returns entries');

  const flagEntry = vaultEntries.find(e => e.value === FLAG);
  assert(flagEntry !== undefined, `Vault contains the FLAG value (${FLAG})`);
} catch (e) {
  assert(false, `Vault test failed: ${e.message}`);
}

// ============================================================
// TEST 7: Vault unauthenticated and as demo agent → auth error
// ============================================================
console.log('\n[TEST 7] Authorization on vault');
try {
  // Unauthenticated vault query
  const unauthResult = await graphqlQuery('query GetVault { vault { key value } }');
  assert(unauthResult.data?.vault === null || unauthResult.errors, 'Unauthenticated vault returns error/null');

  // Login as demo agent (Quackers) and try vault
  const quackersLogin = await graphqlQuery(
    'mutation Login($input: LoginInput!) { login(input: $input) { token } }',
    { input: { email: 'quackers@duckurity.example', password: 'QuackP@ss2026!' } }
  );

  const quackersToken = quackersLogin.data?.login?.token;
  assert(quackersToken !== '', 'Got Quackers JWT token');

  const agentVaultResult = await graphqlQuery(
    'query GetVault { vault { key value } }',
    {},
    { Authorization: `Bearer ${quackersToken}` }
  );

  assert(agentVaultResult.data?.vault === null || agentVaultResult.errors, 'Non-admin vault query returns error');
} catch (e) {
  assert(false, `Authorization test failed: ${e.message}`);
}

// ============================================================
// TEST 8: Flag not greppable in build context / source
// ============================================================
console.log('\n[TEST 8] Flag not in source files');
try {
  const appDir = '/app/app';
  if (existsSync(appDir)) {
    function grepRecursive(dir) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'data') continue;
          if (grepRecursive(fullPath)) {
            console.log(`    Found flag in directory: ${fullPath}`);
            return true;
          }
        } else if (entry.isFile()) {
          const content = readFileSync(fullPath, 'utf-8');
          if (content.includes(FLAG)) {
            console.log(`    Found flag in: ${fullPath}`);
            return true;
          }
        }
      }
      return false;
    }
    const flagInApp = grepRecursive(appDir);
    assert(!flagInApp, 'Flag value not found in app source files');
  } else {
    // Outside container — check local app directory instead
    const localDir = '/duckdesk/app';
    if (existsSync(localDir)) {
      function grepLocalRecursive(dir) {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            if (grepLocalRecursive(fullPath)) return true;
          } else if (entry.isFile()) {
            const content = readFileSync(fullPath, 'utf-8');
            if (content.includes(FLAG)) {
              console.log(`    Found flag in: ${fullPath}`);
              return true;
            }
          }
        }
        return false;
      }
      assert(!grepLocalRecursive(localDir), 'Flag value not found in local app source files');
    } else {
      console.log('    (skipped — no app directory found)');
    }
  }
} catch (e) {
  assert(false, `Grep test failed: ${e.message}`);
}

// ============================================================
// TEST 9: No passwordHash on output types
// ============================================================
console.log('\n[TEST 9] No passwordHash on output types');
try {
  const introspectQuery2 = `
    query IntrospectTypes {
      __schema {
        types { name kind fields { name } }
      }
    }
  `;
  const result = await graphqlQuery(introspectQuery2);
  const data = result.data?.__schema?.types || [];

  // Check Agent type
  const agentType = data.find(t => t.name === 'Agent');
  assert(agentType !== undefined, 'Agent type exists in schema');
  const agentFields = agentType?.fields?.map(f => f.name) || [];
  assert(!agentFields.includes('passwordHash'), 'Agent output type does NOT have passwordHash field');

  // Check TeamMember type
  const teamMemberType = data.find(t => t.name === 'TeamMember');
  assert(teamMemberType !== undefined, 'TeamMember type exists in schema');
  const tmFields = teamMemberType?.fields?.map(f => f.name) || [];
  assert(!tmFields.includes('passwordHash'), 'TeamMember output type does NOT have passwordHash field');

  // Check Viewer type
  const viewerType = data.find(t => t.name === 'Viewer');
  assert(viewerType !== undefined, 'Viewer type exists in schema');
  const viewerFields = viewerType?.fields?.map(f => f.name) || [];
  assert(!viewerFields.includes('passwordHash'), 'Viewer output type does NOT have passwordHash field');
} catch (e) {
  assert(false, `Output type check failed: ${e.message}`);
}

// ============================================================
// SUMMARY
// ============================================================
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
}
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
