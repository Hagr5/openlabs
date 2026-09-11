"use strict";

// Internal control API of the managed function runtime. Only the platform
// service can reach this container (no published ports); requests must carry
// the shared service key.

const http = require("http");
const fs = require("fs");
const path = require("path");

const SHARED_KEY = process.env.FUNCTION_RUNTIME_SHARED_KEY || "dev-runtime-shared-key";
const PORT = Number(process.env.PORT || 8081);

const provisioning = require("./provision");
const executor = require("./executor");

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function authorize(req) {
  return req.headers["x-runtime-key"] === SHARED_KEY;
}

const MAX_ZIP_BYTES = 8 * 1024 * 1024; // base64 of 5MB zip fits well below this

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://internal");

  if (!authorize(req)) {
    return send(res, 401, { error: "UNAUTHORIZED" });
  }

  if (req.method === "GET" && url.pathname === "/v1/healthz") {
    return send(res, 200, { status: "UP", runtime: "nodejs22.x" });
  }

  if (req.method === "POST" && url.pathname === "/v1/provision") {
    try {
      const body = await readBody(req, MAX_ZIP_BYTES);
      const input = JSON.parse(body.toString("utf8"));
      const functionId = String(input.functionId || "");
      if (!/^[0-9a-f-]{36}$/.test(functionId)) {
        return send(res, 400, { ok: false, reason: "invalid functionId" });
      }
      const zipBuffer = Buffer.from(input.zipBase64, "base64");
      const result = provisioning.provision(functionId, zipBuffer);
      if (result.ok) {
        return send(res, 200, { ok: true, main: result.main, runtime: result.runtime });
      }
      return send(res, 200, { ok: false, reason: result.reason });
    } catch (err) {
      return send(res, 400, { ok: false, reason: `provisioning request invalid: ${err.message}` });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/execute") {
    try {
      const body = await readBody(req, 1024 * 1024);
      const input = JSON.parse(body.toString("utf8"));
      const functionId = String(input.functionId || "");
      if (!/^[0-9a-f-]{36}$/.test(functionId)) {
        return send(res, 400, { error: "invalid functionId" });
      }
      const result = await executor.execute(functionId, input.event);
      return send(res, 200, result);
    } catch (err) {
      return send(res, 500, { error: "execution failed", reason: err.message });
    }
  }

  return send(res, 404, { error: "NOT_FOUND" });
});

function prepareEnvironment() {
  // The entrypoint (running as root, then dropping privileges before this
  // process starts) has already materialized the runtime workspace secret
  // from the environment into its file location and scrubbed it; the only
  // read path is the filesystem, via packages executing in this runtime.
  if (process.env.FLAG) {
    // Defensive fallback for development runs outside the container.
    const fs2 = require("fs");
    try {
      fs2.writeFileSync("/tmp/flag.txt", process.env.FLAG + "\n", { mode: 0o400 });
    } catch {
      // ignore
    }
    delete process.env.FLAG;
  }

  // Ensure the packages volume is writable and owned by the sandbox user.
  const packagesDir = provisioning.PACKAGES_DIR;
  fs.mkdirSync(packagesDir, { recursive: true });
}

if (require.main === module) {
  prepareEnvironment();
  server.listen(PORT, () => {
    process.stdout.write(
      JSON.stringify({ level: "info", time: new Date().toISOString(), message: "fn-runtime listening", port: PORT }) + "\n"
    );
  });
}

module.exports = { server, prepareEnvironment };
