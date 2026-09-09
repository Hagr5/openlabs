const express = require('express');
const db = require('./db');
const auth = require('./auth');
const challengeState = require('./state');

const router = express.Router();

function requireAuth(req, res, next) {
  const token = auth.extractBearer(req);
  if (!token) return res.status(401).json({ error: 'missing bearer token' });
  try {
    req.user = auth.verifyStrict(token);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

// POST /api/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const employee = db.findByUsername(username);
  if (!employee || typeof password !== 'string' || typeof employee.password !== 'string' || employee.password !== password) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = auth.issueToken(employee);
  res.json({
    token,
    profile: {
      employee_id: employee.employee_id,
      username: employee.username,
      display_name: employee.display_name,
      department: employee.department,
      role: db.displayRole(employee)
    }
  });
});

// GET /api/profile - returns the caller's own record. Not vulnerable to
// BOLA (the identifier comes entirely from the verified JWT), but it DOES
// intentionally return the full internal record - including the real
// access_tier field that actually controls privilege. A production API
// would trim this to a public-safe DTO; this one doesn't, which is how a
// careful attacker learns the real field name to target (self-disclosure).
router.get('/profile', requireAuth, (req, res) => {
  const me = db.findById(req.user.employee_id);
  if (!me) return res.status(404).json({ error: 'not found' });
  res.json({
    employee_id: me.employee_id,
    username: me.username,
    display_name: me.display_name,
    department: me.department,
    access_tier: me.access_tier,
    role: db.displayRole(me)
  });
});

// POST /api/profile/preferences
//
// VULNERABILITY (BOLA + Mass Assignment):
// The endpoint is meant to let an employee update their own display
// preferences. Instead of resolving the target record from the verified
// JWT, it trusts an `employee_id` field the client can supply in the
// body (BOLA), and then blindly merges every other field in the body
// onto the target record with NO whitelist at all (classic mass
// assignment). The UI only ever sends `display_name`, so nothing here
// documents which other fields exist or what they do - an attacker has
// to notice `access_tier` in their own GET /api/profile response and
// realize it, not the cosmetic `role` field, is what actually matters.
router.post('/profile/preferences', requireAuth, (req, res) => {
  const body = req.body || {};
  const targetId = body.employee_id !== undefined ? Number(body.employee_id) : req.user.employee_id;

  const target = db.findById(targetId);
  if (!target) return res.status(404).json({ error: 'employee not found' });

  // Guardrail: the admin account's `username` field cannot be overridden
  // via this endpoint. Overwriting it (e.g. by including "username" in
  // the body) would silently break the intended solve path - the admin
  // login form looks up by username, so renaming employee 62 makes the
  // account unreachable by its real name with no obvious explanation.
  // This blocks that specific footgun with a clear message rather than
  // letting it happen silently.
  if (Object.prototype.hasOwnProperty.call(body, 'username') && target.employee_id === 62) {
    return res.status(400).json({
      error: 'Overriding the username field on this account is not allowed. Remove "username" from your request body and try again.'
    });
  }

  // Guardrail: an access_tier value containing "admin" is only ever valid
  // for employee 62. This blocks naive self-escalation attempts (setting
  // your own account's access_tier to something admin-like) with a clear
  // signal, rather than letting them silently "succeed" with no effect -
  // it does NOT fix the underlying BOLA, since 62 itself has no such check.
  if (/admin/i.test(body.access_tier || '') && target.employee_id !== 62) {
    return res.status(403).json({
      error: `Employee ID ${target.employee_id} does not have administrative privileges assigned.`
    });
  }

  for (const key of Object.keys(body)) {
    if (key === 'employee_id') continue; // used only to select the target record
    target[key] = body[key];
  }

  const escalated = target.employee_id === 62 && /admin/i.test(target.access_tier || '');
  let result = null;
  if (escalated) {
    result = challengeState.completeRest();
  }

  const response = {
    updated: {
      employee_id: target.employee_id,
      username: target.username,
      display_name: target.display_name,
      department: target.department,
      access_tier: target.access_tier,
      role: db.displayRole(target)
    }
  };

  if (escalated) {
    response.security_notice = {
      message: 'Privilege escalation detected on a monitored account.',
      credential_recovery_fragment: result.fragment,
      hint: result.hint
    };
  }

  res.json(response);
});

// GET /api/admin/dashboard
//
// The admin dashboard is reachable by anyone who can log in AS the admin
// account (i.e. anyone who knows the real password), but the flag itself
// is a separate, independent gate on top of that: it is only included in
// the response once all three vulnerability stages are marked complete
// in server-side state. Successfully authenticating as admin - by
// whatever means - is necessary but not sufficient to see the flag.
router.get('/admin/dashboard', requireAuth, (req, res) => {
  const me = db.findById(req.user.employee_id);
  if (!me || me.username !== 'admin') {
    return res.status(403).json({ error: 'Admins only.' });
  }

  const allDone = challengeState.allComplete();

  res.json({
    employee_id: me.employee_id,
    username: me.username,
    display_name: me.display_name,
    department: me.department,
    verification_complete: allDone,
    flag: allDone ? challengeState.flag() : null,
    message: allDone
      ? 'All verification checks passed.'
      : 'Additional verification required before recovery data can be displayed.'
  });
});

// GET /api/status - safe, read-only view of overall challenge progress.
router.get('/status', requireAuth, (req, res) => {
  res.json(challengeState.status());
});

module.exports = router;
