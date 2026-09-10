"use strict";

const path = require("path");
const express = require("express");
const config = require("./config");
const auth = require("./lib/auth");
const repo = require("./db/repositories");
const logger = require("./lib/logger");
const { seed } = require("./db/seed");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const catalogRoutes = require("./routes/catalog");
const healthRoutes = require("./routes/health");
const stagedUploadRoutes = require("./routes/stagedUpload");

const { createGraphQLApp } = require("./graphql/server");

function createServer() {
  return (async () => {
  const app = express();
  app.disable("x-powered-by");

  // Request logging (method, path, status, duration — never tokens or bodies).
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      logger.info("request", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - start,
      });
    });
    next();
  });

  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false }));

  // Public routes.
  app.use("/api", healthRoutes);
  app.use("/api", catalogRoutes);
  app.use("/", healthRoutes);

  // Authentication middleware populates req.user when a valid session cookie
  // is present; it does not reject here so that public endpoints and login
  // remain reachable without a session.
  app.use((req, res, next) => {
    const cookies = auth.parseCookies(req.headers.cookie);
    const session = auth.getSession(cookies[auth.SESSION_COOKIE]);
    if (session) {
      const user = repo.users.findById(session.userId);
      if (user) {
        req.session = session;
        req.user = user;
      } else {
        auth.destroySession(session.id);
      }
    }
    next();
  });

  // Authenticated routes. CSRF is enforced for state-changing methods on
  // session-authenticated endpoints.
  app.use("/api", (req, res, next) => {
    const authRequired =
      req.path.startsWith("/auth/") ||
      req.path.startsWith("/account/") ||
      req.path.startsWith("/file-management/") ||
      req.path.startsWith("/graphql");
    if (!authRequired) return next();

    const needsLogin =
      req.path === "/auth/login" ? false : true;
    if (needsLogin && !req.user) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    }

    if (req.user && req.method !== "GET" && req.method !== "HEAD") {
      if (!auth.verifyCsrf(req, req.session)) {
        return res.status(403).json({
          error: "CSRF_TOKEN_INVALID",
          message: "A valid X-XSRF-TOKEN header is required for this request.",
        });
      }
    }
    next();
  });

  app.use("/api", authRoutes);
  app.use("/api", userRoutes);
  app.use("/api", stagedUploadRoutes);

  // GraphQL preview endpoint (session-authenticated; interactive dev console
  // on GET for internal use).
  const graphqlApp = await createGraphQLApp();
  app.use("/api/graphql/preview", (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required." });
    }
    next();
  });
  app.use("/api/graphql/preview", graphqlApp);

  // Static storefront.
  app.use(express.static(path.join(__dirname, "..", "public")));

  // 404 for unknown API paths; generic 500 handler that never leaks stacks.
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "NOT_FOUND", message: "Unknown API endpoint." });
  });

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    logger.error("unhandled error", { path: req.path, reason: err.message });
    res.status(500).json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." });
  });

  return app;
  })();
}

async function start() {
  seed();
  const app = await createServer();
  const server = app.listen(config.port, () => {
    logger.info("platform listening", { port: config.port, env: config.env });
  });
  // Graceful shutdown.
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  start();
}

module.exports = { createServer, start };
