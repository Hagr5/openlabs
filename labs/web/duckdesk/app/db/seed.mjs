import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';

const ADMIN_PASSWORD = 'donald';
const DEMO_PASSWORD = 'QuackP@ss2026!';

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

export function seedDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      displayName TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'AGENT',
      department TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      hireDate TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      lastLoginAt TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      agentId TEXT REFERENCES agents(id),
      failedAttempts INTEGER NOT NULL DEFAULT 0,
      lockedUntil TEXT
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      priority INTEGER NOT NULL DEFAULT 3,
      creatorId TEXT REFERENCES agents(id),
      assigneeId TEXT REFERENCES agents(id),
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      ticketId TEXT NOT NULL REFERENCES tickets(id),
      authorId TEXT NOT NULL REFERENCES agents(id),
      body TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS articles (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vault (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Admin password hash
  const adminHash = md5(ADMIN_PASSWORD);

  // Agents data: ~20 agents across departments
  const agents = [
    { id: randomUUID(), displayName: 'Drake Mallard', email: 'drake.mallard@duckurity.example', role: 'ADMIN', department: 'Support', isActive: true, hireDate: '2019-03-15T00:00:00.000Z', passwordHash: adminHash },
    { id: randomUUID(), displayName: 'Della Duck', email: 'della.duck@duckurity.example', role: 'AGENT', department: 'Support', isActive: true, hireDate: '2021-06-01T00:00:00.000Z', passwordHash: md5('Xk9#mP2$vL7&nQ4w') },
    { id: randomUUID(), displayName: 'Scrooge McDuck', email: 'scrooge@duckurity.example', role: 'AGENT', department: 'Finance', isActive: true, hireDate: '2018-11-20T00:00:00.000Z', passwordHash: md5('R7!bN3@kL9#pW2$x') },
    { id: randomUUID(), displayName: 'Huey Duck', email: 'huey.duck@duckurity.example', role: 'AGENT', department: 'SecOps', isActive: true, hireDate: '2022-01-10T00:00:00.000Z', passwordHash: md5('Qw3!zX8@mN5#vB2$') },
    { id: randomUUID(), displayName: 'Dewey Duck', email: 'dewey.duck@duckurity.example', role: 'AGENT', department: 'SecOps', isActive: true, hireDate: '2022-01-10T00:00:00.000Z', passwordHash: md5('Lp7#kR4!mW9@nQ3$') },
    { id: randomUUID(), displayName: 'Louie Duck', email: 'louie.duck@duckurity.example', role: 'AGENT', department: 'SecOps', isActive: true, hireDate: '2022-08-15T00:00:00.000Z', passwordHash: md5('Hj6!bN2@kL8#pW4$x') },
    { id: randomUUID(), displayName: 'Webby Vanderquack', email: 'webby@duckurity.example', role: 'AGENT', department: 'Support', isActive: true, hireDate: '2023-02-01T00:00:00.000Z', passwordHash: md5('Mn4!zX7@mN3#vB9$') },
    { id: randomUUID(), displayName: 'Gyro Gearloose', email: 'gyro@duckurity.example', role: 'AGENT', department: 'Engineering', isActive: true, hireDate: '2017-05-12T00:00:00.000Z', passwordHash: md5('Wq8!bN1@kL6#pW3$x') },
    { id: randomUUID(), displayName: 'Fenton Crackshell', email: 'fenton@duckurity.example', role: 'AGENT', department: 'Engineering', isActive: true, hireDate: '2020-09-01T00:00:00.000Z', passwordHash: md5('Tr5!zX4@mN8#vB7$') },
    { id: randomUUID(), displayName: 'Launchpad McQuack', email: 'launchpad@duckurity.example', role: 'AGENT', department: 'Facilities', isActive: true, hireDate: '2016-03-22T00:00:00.000Z', passwordHash: md5('Yp9!bN6@kL2#pW1$x') },
    { id: randomUUID(), displayName: 'Beakley', email: 'beakley@duckurity.example', role: 'AGENT', department: 'Facilities', isActive: true, hireDate: '2019-07-14T00:00:00.000Z', passwordHash: md5('Ks3!zX5@mN1#vB8$') },
    { id: randomUUID(), displayName: 'Gosalyn Mallard', email: 'gosalyn@duckurity.example', role: 'AGENT', department: 'Support', isActive: true, hireDate: '2023-06-01T00:00:00.000Z', passwordHash: md5('Df7!bN9@kL4#pW6$x') },
    { id: randomUUID(), displayName: 'Magica De Duck', email: 'magica@duckurity.example', role: 'AGENT', department: 'Finance', isActive: true, hireDate: '2021-11-30T00:00:00.000Z', passwordHash: md5('Gh2!zX8@mN5#vB3$') },
    { id: randomUUID(), displayName: 'Flintheart Glomgold', email: 'flint@duckurity.example', role: 'AGENT', department: 'Finance', isActive: true, hireDate: '2020-04-18T00:00:00.000Z', passwordHash: md5('Jk6!bN3@kL9#pW7$x') },
    { id: randomUUID(), displayName: 'John D. Duck', email: 'john.duck@duckurity.example', role: 'AGENT', department: 'Facilities', isActive: true, hireDate: '2018-08-05T00:00:00.000Z', passwordHash: md5('Lm4!zX7@mN2#vB5$') },
    { id: randomUUID(), displayName: 'Eider Duck', email: 'eider@duckurity.example', role: 'AGENT', department: 'Engineering', isActive: true, hireDate: '2019-12-01T00:00:00.000Z', passwordHash: md5('Np8!bN1@kL6#pW4$x') },
    { id: randomUUID(), displayName: 'Quackmore Duck', email: 'quackmore@duckurity.example', role: 'AGENT', department: 'Support', isActive: true, hireDate: '2017-10-15T00:00:00.000Z', passwordHash: md5('Qr3!zX9@mN4#vB8$') },
    { id: randomUUID(), displayName: 'Mrs Beakley', email: 'mrs.beakley@duckurity.example', role: 'AGENT', department: 'Facilities', isActive: true, hireDate: '2015-06-20T00:00:00.000Z', passwordHash: md5('St7!bN5@kL1#pW9$x') },
    { id: randomUUID(), displayName: 'Captain Horatio McDuck', email: 'captain@duckurity.example', role: 'AGENT', department: 'Finance', isActive: false, hireDate: '2010-01-15T00:00:00.000Z', passwordHash: md5('Uv2!zX6@mN8#vB3$') },
    { id: randomUUID(), displayName: 'Quackers McDuck', email: 'quackers@duckurity.example', role: 'AGENT', department: 'Support', isActive: true, hireDate: '2024-03-01T00:00:00.000Z', passwordHash: md5(DEMO_PASSWORD) },
    { id: randomUUID(), displayName: 'Don Karnage', email: 'don@duckurity.example', role: 'AGENT', department: 'Facilities', isActive: true, hireDate: '2024-01-05T00:00:00.000Z', passwordHash: md5('Wx9!bN4@kL7#pW1$x') },
  ];

  const agentInsert = db.prepare(`INSERT OR REPLACE INTO agents (id, displayName, email, role, department, isActive, hireDate, passwordHash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const a of agents) {
    agentInsert.run(a.id, a.displayName, a.email, a.role, a.department, a.isActive ? 1 : 0, a.hireDate, a.passwordHash);
  }

  // Users table - link to agents
  const userInsert = db.prepare(`INSERT OR REPLACE INTO users (id, email, passwordHash, agentId, failedAttempts, lockedUntil) VALUES (?, ?, ?, ?, 0, NULL)`);
  for (const a of agents) {
    userInsert.run(randomUUID(), a.email, a.passwordHash, a.id);
  }

  // Tickets (~15 tickets)
  const ticketIds = [];
  const commentsByTicket = {};
  const now = '2026-08-28T10:00:00.000Z';

  const tickets = [
    { subject: 'Printer jammed in Floor 3', body: 'The HP LaserJet on the third floor keeps jamming every few pages.', status: 'OPEN', priority: 2, creatorId: agents[9].id, assigneeId: agents[10].id },
    { subject: 'VPN disconnects randomly', body: 'Getting disconnected from VPN every 30 minutes. Tried restarting client.', status: 'IN_PROGRESS', priority: 1, creatorId: agents[3].id, assigneeId: agents[2].id },
    { subject: 'New monitor request', body: 'Need a second monitor for development workstation.', status: 'RESOLVED', priority: 4, creatorId: agents[7].id, assigneeId: null },
    { subject: 'Email signature not showing', body: 'Outlook email signatures are defaulting to plain text.', status: 'OPEN', priority: 3, creatorId: agents[5].id, assigneeId: agents[1].id },
    { subject: 'Server room temperature alarm', body: 'Temperature sensor in server room B showing 28°C.', status: 'IN_PROGRESS', priority: 1, creatorId: agents[10].id, assigneeId: agents[9].id },
    { subject: 'Access card not working', body: 'My badge does not open the main entrance since Monday.', status: 'OPEN', priority: 2, creatorId: agents[6].id, assigneeId: null },
    { subject: 'Slack notification delays', body: 'Receiving Slack messages with 15-30 minute delay on mobile.', status: 'RESOLVED', priority: 3, creatorId: agents[4].id, assigneeId: agents[3].id },
    { subject: 'Jenkins build failing', body: 'Pipeline step "deploy-staging" fails with exit code 137.', status: 'OPEN', priority: 2, creatorId: agents[8].id, assigneeId: agents[7].id },
    { subject: 'Conference room AV setup', body: 'Projector in Room 402 has no signal from HDMI port.', status: 'RESOLVED', priority: 3, creatorId: agents[11].id, assigneeId: null },
    { subject: 'Password reset email not arriving', body: 'Requested password reset but never received the email.', status: 'OPEN', priority: 2, creatorId: agents[12].id, assigneeId: agents[0].id },
    { subject: 'Docker image pull slow', body: 'Pulling images from internal registry takes over 5 minutes.', status: 'IN_PROGRESS', priority: 3, creatorId: agents[7].id, assigneeId: null },
    { subject: 'Keycard reader malfunction', body: 'East wing keycard reader flashes red for all cards.', status: 'OPEN', priority: 1, creatorId: agents[14].id, assigneeId: agents[10].id },
    { subject: 'CRM data export error', body: 'Exporting Q3 reports from CRM gives CSV with missing columns.', status: 'RESOLVED', priority: 2, creatorId: agents[2].id, assigneeId: null },
    { subject: 'Wireless AP dead zone', body: 'WiFi signal drops below -80 dBm in the northwest corner of Floor 2.', status: 'OPEN', priority: 3, creatorId: agents[15].id, assigneeId: null },
    { subject: 'Backup verification failed', body: 'Nightly backup job reports checksum mismatch on database dump.', status: 'IN_PROGRESS', priority: 1, creatorId: agents[0].id, assigneeId: agents[3].id },
  ];

  const ticketInsert = db.prepare(`INSERT INTO tickets (id, subject, body, status, priority, creatorId, assigneeId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    const tid = randomUUID();
    ticketIds.push(tid);
    commentsByTicket[tid] = [];
    const daysAgo = Math.floor(Math.random() * 30) + 1;
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString().replace('Z', '.000Z');
    ticketInsert.run(tid, t.subject, t.body, t.status, t.priority, t.creatorId, t.assigneeId || null, createdAt);

    // Add comments to some tickets
    if (i % 3 === 0) {
      const cid = randomUUID();
      commentsByTicket[tid].push(cid);
      db.prepare(`INSERT INTO comments (id, ticketId, authorId, body, createdAt) VALUES (?, ?, ?, ?, ?)`).run(
        cid, tid, t.assigneeId || agents[0].id, 'Taking a look at this now.', createdAt
      );
    }
    if (i % 5 === 0 && i > 0) {
      const cid = randomUUID();
      commentsByTicket[tid].push(cid);
      db.prepare(`INSERT INTO comments (id, ticketId, authorId, body, createdAt) VALUES (?, ?, ?, ?, ?)`).run(
        cid, tid, t.creatorId, 'Thanks for the update.', createdAt
      );
    }
  }

  // Articles (~8 KB total)
  const articles = [
    { slug: 'resetting-vpn', title: 'How to Reset Your VPN Connection', body: 'If you are experiencing disconnection issues:\n\n1. Close the VPN client completely.\n2. Delete existing profiles (Settings > Network > VPN).\n3. Download the latest config from the intranet portal.\n4. Reinstall and reconnect using your credentials.\n\nStill having trouble? Submit a ticket with your OS version.', category: 'Networking', updatedAt: '2026-07-15T00:00:00.000Z' },
    { slug: 'new-hire-checklist', title: 'New Hire IT Checklist', body: 'Welcome to Duckurity! Here is your Day 1 setup:\n\n- Receive laptop and badge from Facilities.\n- Set up email signature in Outlook.\n- Install Slack, Zoom, and the internal tools suite.\n- Join the #general and #it-help channels on Slack.\n- Change your default password within 24 hours.\n- Complete security awareness module on the learning portal.', category: 'Onboarding', updatedAt: '2026-06-01T00:00:00.000Z' },
    { slug: 'password-policy', title: 'Password Policy Overview', body: 'All Duckurity accounts follow these rules:\n\n- Minimum 8 characters.\n- At least one uppercase letter and one number.\n- Cannot reuse the last 5 passwords.\n- Admin accounts use legacy MD5 hashing (migration in progress).\n- Passwords expire every 90 days.\n\nTo change your password, visit the self-service portal or use the "Change My Password" option in the helpdesk app.', category: 'Security', updatedAt: '2026-05-20T00:00:00.000Z' },
    { slug: 'remote-work-setup', title: 'Remote Work Setup Guide', body: 'Working from home? Follow these steps:\n\n1. Install the Duckurity VPN (requires admin credentials).\n2. Configure RDP for Windows machines or use NoMachine for Linux.\n3. Set up SSH keys for server access (~/.ssh/id_ed25519).\n4. Enable 2FA on all cloud accounts via the Okta dashboard.\n\nNote: All remote sessions are logged and monitored.', category: 'Remote Work', updatedAt: '2026-07-01T00:00:00.000Z' },
    { slug: 'hardware-requisitions', title: 'Hardware Requisition Process', body: 'Requesting new hardware:\n\n1. Submit a ticket with the item description and justification.\n2. Get manager approval (required for items over $500).\n3. IT Procurement processes within 3 business days.\n4. Pickup from Facilities or shipping to your address.\n\nStandard turnaround is 5-7 business days for non-stock items.', category: 'Procurement', updatedAt: '2026-04-10T00:00:00.000Z' },
    { slug: 'server-room-access', title: 'Server Room Access Rules', body: 'Floor B, Room 003 — Server Rooms A & B:\n\n- Badge required at all times.\n- Maximum 2 people per room simultaneously.\n- No food or drinks inside.\n- Temperature must stay between 18°C and 24°C.\n- Report any alarms to SecOps immediately.\n- Maintenance window: Sundays 02:00-06:00 UTC.', category: 'Facilities', updatedAt: '2026-03-15T00:00:00.000Z' },
    { slug: 'slack-etiquette', title: 'Slack Etiquette & Channel Guide', body: 'Quick reference for Duckurity Slack:\n\n- #general — Company-wide announcements.\n- #it-help — Submit IT tickets and get help.\n- #secops-alerts — Security incidents and alerts.\n- #engineering — Dev discussions and code reviews.\n- #random — Off-topic fun (duck memes encouraged).\n\nUse threads to keep channels tidy. Avoid DMs for single-question requests.', category: 'Communication', updatedAt: '2026-08-01T00:00:00.000Z' },
    { slug: 'incident-response', title: 'Incident Response Procedures', body: 'When a security incident occurs:\n\n1. Identify the scope (which systems/users affected).\n2. Contain the issue (isolate hosts, revoke credentials).\n3. Escalate to SecOps lead via #secops-alerts.\n4. Document timeline and actions taken.\n5. Post-incident review within 48 hours.\n\nCritical incidents trigger PagerDuty alerts to on-call SecOps.', category: 'Security', updatedAt: '2026-07-20T00:00:00.000Z' },
  ];

  const articleInsert = db.prepare(`INSERT OR REPLACE INTO articles (slug, title, body, category, updatedAt) VALUES (?, ?, ?, ?, ?)`);
  for (const a of articles) {
    articleInsert.run(a.slug, a.title, a.body, a.category, a.updatedAt);
  }

  // Vault entries (decoys + response code from environment)
  const responseCode = process.env.INCIDENT_RESPONSE_CODE;
  const vaultEntries = [
    { key: 'smtp_credentials', value: 'smtp://helpdesk:SmtpP@ss2026@mail.duckurity.internal:587' },
    { key: 'internal_api_key', value: 'dk_live_4eC39HqLyjWDarjtT1zdp7dc' },
    { key: 'redis_password', value: 'R3d1s_S3cur3_P@ss!' },
    { key: 'oauth_client_secret', value: 'gho_XyZ123AbC456DeF789GhI012JkLmNoPqRs' },
  ];
  if (responseCode) {
    vaultEntries.push({ key: 'incident_response_code', value: responseCode });
  }

  const vaultInsert = db.prepare(`INSERT OR REPLACE INTO vault (key, value) VALUES (?, ?)`);
  for (const v of vaultEntries) {
    vaultInsert.run(v.key, v.value);
  }

  db.close();
  return { adminHash, responseCode: responseCode || null };
}
