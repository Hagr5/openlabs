"use strict";

const path = require("path");

// Simple env-driven configuration with safe fallbacks for local development.
const config = {
  port: Number(process.env.PORT || 4000),
  env: process.env.NODE_ENV || "development",
  dataDir: process.env.DATA_DIR || "/data",
  sessionSecret: process.env.SESSION_SECRET || "dev-only-session-secret",
  sessionTtlMs: 2 * 60 * 60 * 1000, // 2 hours
  lockoutThreshold: 5,
  lockoutWindowMs: 10 * 60 * 1000, // 10 minutes
  runtime: {
    baseUrl: process.env.FUNCTION_RUNTIME_BASE_URL || "http://fn-runtime:8081",
    sharedKey: process.env.FUNCTION_RUNTIME_SHARED_KEY || "dev-runtime-shared-key",
    provisioningDelayMs: 2000,
  },
  uploads: {
    maxZipBytes: 5 * 1024 * 1024, // 5 MB
  },
  quotas: {
    maxFunctionsPerAccount: 10,
    maxWebhookConfigurationsPerAccount: 10,
  },
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || "ops@duckurity.example",
    adminPassword: process.env.SEED_ADMIN_PASSWORD,
  },
};

config.dbPath = path.join(config.dataDir, "duckmarket.db");

module.exports = config;
