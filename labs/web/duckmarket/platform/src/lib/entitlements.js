"use strict";

// Entitlement checks for the account-level "Functions (Preview)" pilot.
//
// The Functions pilot is restricted to entitled accounts: internal
// administrators and pilot partners. Entitlement is granted per-account by
// the Duckurity platform team (see docs/PILOT_ROLLOUT.md in the platform
// repo). This module is the single source of truth for entitlement on the
// highest-risk operation: direct invocation.

const ROLE_USER = "ROLE_USER";
const ROLE_ADMIN = "ROLE_ADMIN";

const FUNCTION_RUNTIME = "nodejs22.x";

// Pilot-partner accounts are tracked in the enterprise entitlement registry.
// For the preview this is intentionally minimal: admins + the partner list.
const PILOT_PARTNER_ACCOUNTS = new Set([]);

function isAdmin(user) {
  return !!user && user.role === ROLE_ADMIN;
}

function hasFunctionsEntitlement(user) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return PILOT_PARTNER_ACCOUNTS.has(user.accountId);
}

module.exports = {
  ROLE_USER,
  ROLE_ADMIN,
  FUNCTION_RUNTIME,
  isAdmin,
  hasFunctionsEntitlement,
};
