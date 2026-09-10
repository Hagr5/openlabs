/**
 * server.js — techvault-api
 *
 * Assembles all resolvers built in steps 1–7 into a single running
 * Apollo Server (Express) instance. GraphQL-only API — no REST routes
 * exist anywhere except the `/health` liveness probe, which is
 * intentionally independent of GraphQL/DB health (mirrors the reference
 * pattern: a broken resolver must never make the health check unreliable).
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const { ApolloServer } = require('apollo-server-express');

const { initDatabase } = require('./db');
const { buildContext } = require('./context');

const { createUserModel } = require('./models/userModel');
const { createArtifactModel } = require('./models/artifactModel');
const { createSessionModel } = require('./models/sessionModel');
const { createLaptopModel } = require('./models/laptopModel');

const { createAuthService } = require('./services/authService');
const { createArtifactService } = require('./services/artifactService');
const { createPreviewService } = require('./services/previewService');
const { createCompetitorPriceService } = require('./services/competitorPriceService');

const { createAuthResolvers } = require('./resolvers/authResolvers');
const { createArtifactResolvers } = require('./resolvers/artifactResolvers');
const { createPreviewResolvers } = require('./resolvers/previewResolvers');
const { createCompetitorPriceResolvers } = require('./resolvers/competitorPriceResolvers');
const { createReviewResolvers } = require('./resolvers/reviewResolvers');

function mergeResolvers(...resolverObjects) {
  const merged = { Query: {}, Mutation: {} };
  for (const r of resolverObjects) {
    if (r.Query) Object.assign(merged.Query, r.Query);
    if (r.Mutation) Object.assign(merged.Mutation, r.Mutation);
  }
  return merged;
}

async function start() {
  // ---- Wire the DB + models ----
  const db = initDatabase();
  const userModel = createUserModel(db);
  const artifactModel = createArtifactModel(db);
  const sessionModel = createSessionModel(db);
  const laptopModel = createLaptopModel(db);

  // ---- Wire the services ----
  const authService = createAuthService({ userModel, sessionModel });
  const artifactService = createArtifactService({ artifactModel });
  const previewService = createPreviewService({ artifactService });
  const competitorPriceService = createCompetitorPriceService({ artifactService });

  // ---- Wire the resolvers ----
  const resolvers = mergeResolvers(
    createAuthResolvers({ authService }),
    createArtifactResolvers({ artifactService }),
    createPreviewResolvers({ previewService }),
    createCompetitorPriceResolvers({ competitorPriceService }),
    createReviewResolvers(),
    {
      Query: {
        me: (_p, _a, context) => context.currentUser || null,
        laptops: (_p, { brand, maxPrice }) => laptopModel.findAll({ brand, maxPrice }),
        laptop: (_p, { id }) => laptopModel.findById(id),
      },
    }
  );

  const typeDefs = fs.readFileSync(
    path.join(__dirname, 'schema.graphql'),
    'utf8'
  );

  const app = express();

  // Independent liveness probe — never touches GraphQL execution.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: buildContext({ sessionModel, userModel }),
    introspection: true, // intentionally left on — see resolver-design.md
  });

  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  const port = process.env.PORT || 4000;
  app.listen(port, '0.0.0.0', () => {
    console.log(JSON.stringify({ lvl: 'info', msg: 'techvault-api started', port }));
  });
}

start().catch((err) => {
  console.error(JSON.stringify({ lvl: 'error', msg: 'startup failed', err: String(err) }));
  process.exit(1);
});
