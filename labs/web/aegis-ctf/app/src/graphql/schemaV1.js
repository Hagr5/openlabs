const { buildSchema } = require('graphql');
const db = require('../db');
const challengeState = require('../state');

// Legacy schema (v1). Kept online for "internal migration tooling" that
// was never fully decommissioned. Introspection is left enabled here
// (unlike v2) because nobody remembered this endpoint was still public.
const schema = buildSchema(`
  type Employee {
    employee_id: Int
    username: String
    display_name: String
    department: String
    role: String
  }

  type LegacyCredential {
    prefix: String
    migration_key: String
    internal_note: String
  }

  type Query {
    employee(username: String!): Employee

    """
    Internal-only resolver used by the legacy account migration tool to
    pull a recovery credential fragment for a given admin account during
    cutover. Superseded by adminCredential in the v2 API.
    """
    legacyCredentialResolver(username: String!): LegacyCredential
  }
`);

// VULNERABILITY (Broken Object Level Authorization via GraphQL):
// legacyCredentialResolver trusts the client-supplied `username` argument
// completely. It never checks that the caller (from the verified JWT in
// context) is the account being requested, or that the caller has any
// elevated privilege. Any authenticated employee can request the
// credential fragment for ANY other username, including "admin".
const root = {
  employee: ({ username }) => {
    const e = db.findByUsername(username);
    if (!e) return null;
    return e;
  },
  legacyCredentialResolver: ({ username }, context) => {
    // Authentication IS required (any logged-in employee) - this is
    // deliberately NOT a broken-authentication bug like the gRPC stage.
    // The flaw is purely object-level: no ownership check on `username`.
    if (!context.user) {
      throw new Error('authentication required');
    }

    const target = db.findByUsername(username);
    if (!target) return null;

    if (target.username === 'admin') {
      const result = challengeState.completeGraphql();
      return {
        prefix: 'AEG',
        migration_key: result.fragment,
        internal_note: result.hint || 'No further verification steps remain.'
      };
    }

    return { prefix: 'N/A', migration_key: 'no-migration-pending' };
  }
};

module.exports = { schema, root };
