import { verifyToken, getAuthFromHeader } from './lib/auth.mjs';
import { buildAgentWhere, validateFilterKeys } from './lib/filters.mjs';
import { randomUUID } from 'node:crypto';
import crypto from 'node:crypto';
import { GraphQLScalarType, Kind } from 'graphql';

const ADMIN_ROLE = 'ADMIN';
const AGENT_ROLE = 'AGENT';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 10 * 60 * 1000; // 10 minutes

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function requireAuth(contextValue) {
  const authHeader = contextValue?.req?.headers?.authorization;
  const user = getAuthFromHeader(authHeader);
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

function requireAdmin(contextValue) {
  const user = requireAuth(contextValue);
  if (user.role !== ADMIN_ROLE) {
    throw new Error('Admin access required');
  }
  return user;
}

export const resolvers = {
  DateTime: new GraphQLScalarType({
    name: 'DateTime',
    description: 'ISO-8601 date-time string',
    serialize: (value) => {
      if (value instanceof Date) return value.toISOString();
      return String(value);
    },
    parseValue: (value) => {
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new TypeError('DateTime must be an ISO-8601 string');
      }
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        throw new TypeError('DateTime must be a valid date');
      }
      return d.toISOString();
    },
    parseLiteral: (ast) => {
      if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
        const d = new Date(ast.kind === Kind.STRING ? ast.value : Number(ast.value));
        if (isNaN(d.getTime())) {
          throw new TypeError('DateTime must be a valid date');
        }
        return d.toISOString();
      }
      throw new TypeError('DateTime must be an ISO-8601 string');
    },
  }),

  Query: {
    serviceStatus: () => ({
      version: '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
    }),

    articles: (_, { category, first = 20 }, contextValue) => {
      const db = contextValue.db;
      let sql = 'SELECT slug, title, body, category, updatedAt FROM articles';
      const params = [];

      if (category) {
        sql += ' WHERE category = ?';
        params.push(category);
      }

      sql += ' ORDER BY updatedAt DESC LIMIT ?';
      params.push(first);

      const rows = db.prepare(sql).all(...params);
      return {
        articles: rows,
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },

    article: (_, { slug }, contextValue) => {
      const db = contextValue.db;
      return db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug) || null;
    },

    teamPage: (_, __, contextValue) => {
      const db = contextValue.db;
      const rows = db.prepare(
        "SELECT displayName, department, role FROM agents WHERE isActive = 1 ORDER BY department, displayName"
      ).all();

      return rows.map(r => ({
        displayName: r.displayName,
        department: r.department,
        roleLabel: r.role === ADMIN_ROLE ? 'Head of Support' : 'Support Agent',
      }));
    },

    teamStats: (_, { filter }, contextValue) => {
      const db = contextValue.db;
      validateFilterKeys(filter, ['displayName', 'email', 'department', 'role', 'isActive', 'hiredAfter', 'hiredBefore', 'passwordHash']);
      const where = buildAgentWhere(filter);

      // Only count active agents for team stats
      let sql = `SELECT COUNT(*) as headcount FROM agents WHERE isActive = 1`;
      if (where.sql) {
        sql += ` AND ${where.sql}`;
      }

      const result = db.prepare(sql).get(...where.params);
      return { headcount: result.headcount };
    },

    viewer: (_, __, contextValue) => {
      const user = requireAuth(contextValue);
      const db = contextValue.db;
      const agent = db.prepare('SELECT id, displayName, email, role, department FROM agents WHERE id = ?').get(user.sub);
      if (!agent) throw new Error('Agent not found');
      return agent;
    },

    tickets: (_, { status, first = 20 }, contextValue) => {
      requireAuth(contextValue);
      const db = contextValue.db;
      let sql = `SELECT id, subject, body, status, priority, creatorId, assigneeId, createdAt FROM tickets`;

      const conditions = [];
      const params = [];

      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ` ORDER BY createdAt DESC LIMIT ?`;
      params.push(first);

      const rows = db.prepare(sql).all(...params);

      const commentStmt = db.prepare('SELECT id, authorId, body, createdAt FROM comments WHERE ticketId = ? ORDER BY createdAt');

      return {
        tickets: rows.map(r => ({
          ...r,
          comments: commentStmt.all(r.id),
        })),
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },

    ticket: (_, { id }, contextValue) => {
      const user = requireAuth(contextValue);
      const db = contextValue.db;
      const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
      if (!ticket) throw new Error('Ticket not found');

      // Authorization: only creator, assignee, or admin can view
      if (user.role !== ADMIN_ROLE && user.sub !== ticket.creatorId && user.sub !== ticket.assigneeId) {
        throw new Error('Access denied');
      }

      const comments = db.prepare(
        'SELECT id, authorId, body, createdAt FROM comments WHERE ticketId = ? ORDER BY createdAt'
      ).all(id);

      return {
        ...ticket,
        comments: comments.map(c => ({
          id: c.id,
          authorId: c.authorId,
          body: c.body,
          createdAt: c.createdAt,
        })),
      };
    },

    agents: (_, { filter, first = 20 }, contextValue) => {
      requireAdmin(contextValue);
      const db = contextValue.db;
      validateFilterKeys(filter, ['displayName', 'email', 'department', 'role', 'isActive', 'hiredAfter', 'hiredBefore', 'passwordHash']);
      const where = buildAgentWhere(filter);

      let sql = `SELECT id, displayName, email, role, department, isActive, hireDate, lastLoginAt FROM agents`;
      if (where.sql) {
        sql += ` WHERE ${where.sql}`;
      }
      sql += ' ORDER BY displayName LIMIT ?';
      const rows = db.prepare(sql).all(...where.params, first);

      return {
        agents: rows.map(r => ({ ...r, isActive: Boolean(r.isActive), lastLoginAt: r.lastLoginAt || null })),
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },

    vault: (_, __, contextValue) => {
      requireAdmin(contextValue);
      const db = contextValue.db;
      return db.prepare('SELECT key, value FROM vault ORDER BY key').all();
    },
  },

  Mutation: {
    login: (_, { input }, contextValue) => {
      const db = contextValue.db;
      const { email, password } = input;

      // Look up user by email
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        return { token: '', viewer: null };
      }

      // Check lockout
      if (user.lockedUntil) {
        const lockedUntilDate = new Date(user.lockedUntil);
        if (lockedUntilDate > new Date()) {
          // Locked: respond exactly like a failed login (generic behavior)
          return { token: '', viewer: null };
        } else {
          // Lockout expired, reset attempts
          db.prepare('UPDATE users SET failedAttempts = 0, lockedUntil = NULL WHERE id = ?').run(user.id);
        }
      }

      const passwordHash = md5(password);

      if (passwordHash !== user.passwordHash) {
        // Increment failed attempts
        const newAttempts = user.failedAttempts + 1;
        let lockedUntil = null;
        if (newAttempts >= MAX_FAILED_ATTEMPTS) {
          lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
        }
        db.prepare('UPDATE users SET failedAttempts = ?, lockedUntil = ? WHERE id = ?').run(newAttempts, lockedUntil, user.id);

        return { token: '', viewer: null };
      }

      // Successful login - reset attempts and update lastLoginAt
      const agentId = user.agentId;
      db.prepare('UPDATE users SET failedAttempts = 0, lockedUntil = NULL WHERE id = ?').run(user.id);
      if (agentId) {
        db.prepare('UPDATE agents SET lastLoginAt = ? WHERE id = ?').run(new Date().toISOString(), agentId);
      }

      // Look up the agent to use their real role in the token
      const agent = db.prepare('SELECT id, displayName, email, role, department FROM agents WHERE id = ?').get(user.agentId);

      const token = contextValue.createToken
        ? contextValue.createToken({ sub: user.agentId, email: user.email, role: agent ? agent.role : AGENT_ROLE })
        : '';

      return { token, viewer: agent || null };
    },

    createTicket: (_, { input }, contextValue) => {
      requireAuth(contextValue);
      const db = contextValue.db;
      const user = requireAuth(contextValue);
      const id = randomUUID();

      db.prepare(
        'INSERT INTO tickets (id, subject, body, status, priority, creatorId, assigneeId, createdAt) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)'
      ).run(id, input.subject, input.body, 'OPEN', input.priority || 3, user.sub, new Date().toISOString());

      const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
      return { ...ticket, comments: [] };
    },

    addComment: (_, { input }, contextValue) => {
      requireAuth(contextValue);
      const db = contextValue.db;
      const user = requireAuth(contextValue);

      // Verify ticket exists and user has access (creator, assignee, or admin)
      const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(input.ticketId);
      if (!ticket) throw new Error('Ticket not found');

      if (user.role !== ADMIN_ROLE && user.sub !== ticket.creatorId && user.sub !== ticket.assigneeId) {
        throw new Error('Access denied');
      }

      const id = randomUUID();
      db.prepare(
        'INSERT INTO comments (id, ticketId, authorId, body, createdAt) VALUES (?, ?, ?, ?, ?)'
      ).run(id, input.ticketId, user.sub, input.body, new Date().toISOString());

      return { id, authorId: user.sub, body: input.body, createdAt: new Date().toISOString() };
    },

    updateTicketStatus: (_, { input }, contextValue) => {
      requireAuth(contextValue);
      const db = contextValue.db;
      const user = requireAuth(contextValue);

      const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(input.ticketId);
      if (!ticket) throw new Error('Ticket not found');

      // Only assignee or admin can update status
      if (user.role !== ADMIN_ROLE && user.sub !== ticket.assigneeId) {
        throw new Error('Access denied');
      }

      db.prepare('UPDATE tickets SET status = ? WHERE id = ?').run(input.status, input.ticketId);

      const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(input.ticketId);
      return { ...updated, comments: [] };
    },

    changeMyPassword: (_, { input }, contextValue) => {
      requireAuth(contextValue);
      const db = contextValue.db;
      const user = requireAuth(contextValue);

      const userData = db.prepare('SELECT * FROM users WHERE agentId = ?').get(user.sub);
      if (!userData) throw new Error('User not found');

      const oldHash = md5(input.oldPassword);
      if (oldHash !== userData.passwordHash) {
        return false;
      }

      const newHash = md5(input.newPassword);
      db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(newHash, userData.id);
      db.prepare('UPDATE agents SET passwordHash = ? WHERE id = ?').run(newHash, user.sub);

      return true;
    },
  },
};
