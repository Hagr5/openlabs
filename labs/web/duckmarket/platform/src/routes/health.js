"use strict";

const express = require("express");
const runtimeClient = require("../lib/runtime-client");

const router = express.Router();

router.get("/healthz", async (req, res) => {
  try {
    const dbOk = checkDatabase();
    const runtimeOk = await runtimeClient.runtimeHealth();
    if (dbOk && runtimeOk) {
      return res.json({ status: "UP", checks: { database: "UP", functionRuntime: "UP" } });
    }
    return res.status(503).json({
      status: "DEGRADED",
      checks: {
        database: dbOk ? "UP" : "DOWN",
        functionRuntime: runtimeOk ? "UP" : "DOWN",
      },
    });
  } catch {
    return res.status(503).json({ status: "DOWN", checks: {} });
  }
});

function checkDatabase() {
  try {
    const { getDb } = require("../db");
    getDb().prepare("SELECT 1 AS one").get();
    return true;
  } catch {
    return false;
  }
}

module.exports = router;
