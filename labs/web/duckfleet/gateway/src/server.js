const path = require("path");
const express = require("express");
const { bridgeRequest } = require("./bridge");
const { healthCheck } = require("./health");

const PORT = process.env.PORT || "4000";
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const app = express();
app.disable("x-powered-by");

app.get("/healthz", async (req, res) => {
  try {
    const backend = await healthCheck();
    res.status(200).json({ status: "ok", backend });
  } catch (err) {
    res.status(503).json({ status: "degraded", backend: "unreachable" });
  }
});

app.all("/api/grpc/:service/:method", (req, res) => {
  bridgeRequest(req, res);
});

app.use(express.static(PUBLIC_DIR, { index: "index.html", maxAge: "5m" }));

app.use((req, res) => {
  res.status(404).type("text/plain").send("NOT_FOUND");
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  res.status(500).type("text/plain").send("INTERNAL_ERROR");
});

const server = app.listen(Number(PORT), "0.0.0.0", () => {
  process.stdout.write(`duckfleet gateway listening on :${PORT}\n`);
});
server.requestTimeout = 0;

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
