/**
 * data.js — deterministic, in-memory seed data for billing-core.
 *
 * No database here on purpose: this is a small internal service and its
 * data never needs to persist across restarts for the challenge to work
 * (the "reset" story for billing-core is simply: restart the container →
 * identical in-memory state every time → fully deterministic).
 */

// Flag resolution mirrors the standard pattern for this CTF platform:
// env var -> file -> fallback. Kept out of source control; injected at
// deploy time (see docker-compose.yml / .env in step 8).
function resolveFlag() {
  const fs = require('fs');
  if (process.env.FLAG) return process.env.FLAG;
  try {
    const content = fs.readFileSync('/app/flag.txt', 'utf8').trim();
    if (content) return content;
  } catch (_) {
    /* no flag file mounted — fall through */
  }
  return 'CTF{flag_not_configured}';
}

const FLAG = resolveFlag();

// Only ONE account matters for the challenge; a couple of decoys exist so
// the field isn't trivially "the only record" if a player enumerates ids.
const ACCOUNTS = {
  '1001': {
    accountId: '1001',
    balance: 4210.5,
    currency: 'USD',
    notes: 'Reconciled 2026-08-11. No discrepancies.',
  },
  '1002': {
    accountId: '1002',
    balance: 980.0,
    currency: 'USD',
    notes: 'Pending vendor confirmation.',
  },
  // The account referenced by the config file players decode during the
  // command-injection stage (see resolver-design.md, seed data — step 9).
  '9042': {
    accountId: '9042',
    balance: 0.0,
    currency: 'USD',
    notes: `Internal reconciliation flag: ${FLAG}`,
  },
};

module.exports = { ACCOUNTS, FLAG };
