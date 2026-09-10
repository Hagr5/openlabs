/**
 * server.js — billing-core
 *
 * Minimal, standalone GraphQL server. Runs on the Docker-internal network
 * only (no `ports:` mapping in docker-compose.yml — see step 8). It is not
 * reachable from the player's machine under any normal circumstance; the
 * only path in is techvault-api's `fetchCompetitorPrice` SSRF.
 *
 * GraphQL-over-GET is intentionally left enabled for `query` operations
 * (default Apollo Server behavior) — this matters for the intended attack
 * path: techvault-api's SSRF forwards a caller-supplied URL as a plain
 * HTTP GET, so the exploit must be expressible as
 * `http://<host>/graphql?query={...}` rather than a POST body.
 */

const { ApolloServer } = require('apollo-server-express');
const express = require('express');
const fs = require('fs');
const path = require('path');

const { resolvers } = require('./resolvers');

const typeDefs = fs.readFileSync(
  path.join(__dirname, 'schema.graphql'),
  'utf8'
);

async function start() {
  const app = express();

  // Independent of GraphQL — same pattern as techvault-api: a broken
  // resolver should never make the liveness probe unreliable.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true, // fine to leave on: this API is never reachable
                          // by players directly, only via the SSRF vector.
  });

  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  const port = process.env.PORT || 5000;
  app.listen(port, '0.0.0.0', () => {
    console.log(
      JSON.stringify({ lvl: 'info', msg: 'billing-core started', port })
    );
  });
}

start().catch((err) => {
  console.error(JSON.stringify({ lvl: 'error', msg: 'startup failed', err: String(err) }));
  process.exit(1);
});
