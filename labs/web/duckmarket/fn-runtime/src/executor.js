"use strict";

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const RESULT_SENTINEL = "__duck_fn_result__";

const MAX_LOG_LINES = 200;
const MAX_LOG_BYTES = 64 * 1024;
const EXEC_TIMEOUT_MS = 5000;
const RUNNER_PATH = path.join(__dirname, "runner.js");
const NODE_BIN = process.execPath;

function execute(functionId, event) {
  return new Promise((resolve) => {
    const dir = path.join(__dirname, "..", "packages", functionId);
    // Packages live under the /packages volume, alongside runtime workspace
    // files owned by the sandbox identity.
    const pkgDir = process.env.PACKAGES_DIR
      ? path.join(process.env.PACKAGES_DIR, functionId)
      : dir;

    if (!fs.existsSync(pkgDir)) {
      return resolve({
        successful: false,
        startedOn: new Date().toISOString(),
        endedOn: new Date().toISOString(),
        error: "package not provisioned",
        logs: [],
      });
    }

    let mainSpec = "index.js";
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
      if (typeof pkg.main === "string" && pkg.main.length) mainSpec = pkg.main;
    } catch {
      // fall through with default
    }

    // Read the main entry spec recorded at provision time when available.
    const metaPath = path.join(pkgDir, ".fn-meta.json");
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        if (typeof meta.main === "string") mainSpec = meta.main;
      } catch {
        // ignore
      }
    }

    const env = {
      PATH: "/usr/local/bin:/usr/bin:/bin",
      HOME: pkgDir,
      NODE_ENV: "production",
      __FN_ID__: functionId,
      __FN_MAIN__: mainSpec,
      __FN_EVENT__: JSON.stringify(event || {}),
    };

    const child = spawn(NODE_BIN, [RUNNER_PATH], {
      cwd: pkgDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
      // The container itself runs as the sandbox user; the child inherits it.
    });

    const startedOn = new Date().toISOString();
    const logs = [];
    let logBytes = 0;
    let truncated = false;
    let stdoutTail = "";
    let stderrTail = "";
    let result = null;
    let settled = false;

    function pushLog(message) {
      if (truncated) return;
      if (logs.length >= MAX_LOG_LINES || logBytes + message.length > MAX_LOG_BYTES) {
        truncated = true;
        logs.push({
          timestamp: new Date().toISOString(),
          message: "[log limit reached; output truncated]",
        });
        return;
      }
      logs.push({ timestamp: new Date().toISOString(), message });
      logBytes += message.length;
    }

    function parseSentinel(chunkText, tailHolder) {
      tailHolder.value += chunkText;
      const lines = tailHolder.value.split("\n");
      tailHolder.value = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith(RESULT_SENTINEL)) {
          try {
            result = JSON.parse(line.slice(RESULT_SENTINEL.length));
          } catch {
            // malformed trailer; leave result null
          }
        } else if (line.length > 0) {
          pushLog(line);
        }
      }
    }

    const stdoutTailHolder = { value: "" };
    const stderrTailHolder = { value: "" };

    child.stdout.on("data", (chunk) => {
      parseSentinel(chunk.toString("utf8"), stdoutTailHolder);
    });
    child.stderr.on("data", (chunk) => {
      parseSentinel(chunk.toString("utf8"), stderrTailHolder);
    });

    const timer = setTimeout(() => {
      if (!settled) {
        pushLog("[execution exceeded 5000ms; terminating]");
        try {
          child.kill("SIGKILL");
        } catch {
          // already dead
        }
      }
    }, EXEC_TIMEOUT_MS);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        successful: false,
        startedOn,
        endedOn: new Date().toISOString(),
        error: `runtime could not start the process: ${err.message}`,
        logs,
      });
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      // Flush any remaining partial lines without the sentinel.
      for (const holder of [stdoutTailHolder, stderrTailHolder]) {
        const rest = holder.value.trim();
        if (rest && !rest.startsWith(RESULT_SENTINEL)) pushLog(rest);
      }

      if (result) {
        resolve({
          successful: !!result.successful,
          startedOn: result.startedOn || startedOn,
          endedOn: result.endedOn || new Date().toISOString(),
          error: result.error || null,
          logs,
        });
        return;
      }

      if (signal === "SIGKILL") {
        resolve({
          successful: false,
          startedOn,
          endedOn: new Date().toISOString(),
          error: "execution exceeded the 5000ms timeout",
          logs,
        });
        return;
      }

      resolve({
        successful: false,
        startedOn,
        endedOn: new Date().toISOString(),
        error: `process exited unexpectedly (code ${code})`,
        logs,
      });
    });
  });
}

module.exports = { execute, RESULT_SENTINEL };
