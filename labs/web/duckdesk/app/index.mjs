import { ApolloServer } from '@apollo/server';
import { GraphQLError } from 'graphql';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import http from 'node:http';
import { seedDatabase } from './db/seed.mjs';
import { typeDefs } from './schema.mjs';
import { resolvers } from './resolvers.mjs';
import { createToken } from './lib/auth.mjs';

const PORT = parseInt(process.env.PORT || '4000', 10);
const DB_PATH = process.env.DB_PATH || '/data/duckdesk.db';
const MAX_DEPTH = parseInt(process.env.MAX_QUERY_DEPTH || '12', 10);

// Reject queries that nest selections deeper than MAX_DEPTH.
function depthLimitRule(context) {
  let currentDepth = 0;
  return {
    Field: {
      enter() {
        currentDepth++;
        if (currentDepth > MAX_DEPTH) {
          context.reportError(
            new GraphQLError(`Query exceeds maximum depth of ${MAX_DEPTH}.`, { nodes: [] })
          );
        }
      },
      leave() {
        currentDepth--;
      },
    },
  };
}

// Ensure data directory exists
const dbDir = join(DB_PATH, '..');
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Seed database if it doesn't exist or is empty
let testDb = new Database(DB_PATH);
testDb.pragma('journal_mode = WAL');
try {
  const agentCount = testDb.prepare('SELECT COUNT(*) as cnt FROM agents').get();
  if (agentCount.cnt === 0) {
    testDb.close();
    seedDatabase(DB_PATH);
  } else {
    testDb.close();
  }
} catch (e) {
  try { testDb.close(); } catch (_) {}
  seedDatabase(DB_PATH);
}

console.log(`DuckDesk API starting on port ${PORT}`);
console.log(`Database: ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
  validationRules: [depthLimitRule],
});

await server.start();

const httpServer = http.createServer(async (req, res) => {
  // Health check
  if (req.url === '/healthz' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  }

  // Landing page
  if ((req.url === '/' || req.url === '/graphql') && req.method === 'GET') {
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>DuckDesk — IT Helpdesk</title>
<style>body{margin:0;padding:32px;font-family:sans-serif;background:#f5f5f5;color:#333;}h1{color:#222;}</style></head>
<body><div style="max-width:720px;margin:0 auto;"><h1>DuckDesk API</h1>
<p>Internal IT Helpdesk API for Duckurity.</p>
<p><strong>Endpoint:</strong> <code>POST /graphql</code></p>
<p style="color:#666;font-size:14px;">Send GraphQL operations as JSON POST requests to <code>/graphql</code> with <code>Content-Type: application/json</code>.</p>
</div></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }

  // GraphQL endpoint: POST only
  if (req.url === '/graphql' || req.url === '/graphql/') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', 'Allow': 'POST' });
      return res.end(JSON.stringify({ errors: [{ message: 'Method not allowed. Use POST for GraphQL operations.' }] }));
    }

    const chunks = [];
    await new Promise((resolve) => {
      req.on('data', (c) => chunks.push(c));
      req.on('end', resolve);
      req.on('error', resolve);
    });
    const bodyBuf = Buffer.concat(chunks);

    try {
      // Parse the JSON body ourselves; Apollo Server 4's
      // executeHTTPGraphQLRequest expects the parsed object as `body`.
      let parsedBody;
      try {
        parsedBody = JSON.parse(bodyBuf.toString('utf-8'));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ errors: [{ message: 'POST body must be valid JSON.' }] }));
      }

      const result = await server.executeHTTPGraphQLRequest({
        httpGraphQLRequest: {
          method: 'POST',
          headers: new Map(
            Object.entries(req.headers).filter(([, v]) => v !== undefined)
          ),
          search: '',
          body: parsedBody,
        },
        context: () => ({
          db,
          req,
          createToken: (payload) => createToken(payload),
        }),
      });

      const headers = {};
      for (const [k, v] of result.headers) {
        headers[k] = v;
      }
      res.writeHead(result.status || 200, headers);

      if (result.body.kind === 'complete') {
        return res.end(result.body.string);
      }
      // chunked response
      for await (const chunk of result.body.chunks) {
        if (chunk !== null) {
          res.write(JSON.stringify(chunk));
        }
      }
      return res.end();
    } catch (err) {
      console.error('GraphQL error:', err && err.message ? err.message : err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ errors: [{ message: 'Internal server error' }] }));
      }
      return res.end();
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ error: 'Not found' }));
});

httpServer.listen(PORT, () => {
  console.log(`DuckDesk API available at http://localhost:${PORT}/`);
  console.log(`Health check at http://localhost:${PORT}/healthz`);
  console.log(`GraphQL endpoint at http://localhost:${PORT}/graphql`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  httpServer.close();
  server.stop();
  db.close();
  process.exit(0);
});
