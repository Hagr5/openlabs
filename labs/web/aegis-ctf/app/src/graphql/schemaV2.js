const { buildSchema } = require('graphql');
const db = require('../db');

// Current, hardened schema (v2). Introspection is disabled at the server
// layer (see graphqlV2 mount in rest server) and adminCredential performs
// a real role check against the verified caller identity.
const schema = buildSchema(`
  type Employee {
    employee_id: Int
    username: String
    display_name: String
    department: String
    role: String
  }

  type Admin {
    id: Int
    username: String
    credential: String
  }

  type Query {
    employee(username: String!): Employee
    adminCredential: Admin
  }
`);

const root = {
  employee: ({ username }, context) => {
    if (!context.user) return null;
    // v2 only lets you fetch your own record.
    if (context.user.username !== username) {
      throw new Error('access denied');
    }
    return db.findByUsername(username);
  },
  adminCredential: (_args, context) => {
    if (!context.user || context.user.role !== 'admin') {
      throw new Error('access denied');
    }
    const admin = db.findByUsername('admin');
    return { id: admin.employee_id, username: admin.username, credential: 'not-available-via-api' };
  }
};

module.exports = { schema, root };
