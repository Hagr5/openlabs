// Function entrypoint wrapper. Spawned by the executor as the sandbox user
// with cwd set to the function package directory.
//
// Contract: the package's main export must provide `exports.handler(event, ctx)`.
// The wrapper requires the main module, invokes the handler, and prints a
// machine-readable result trailer on stdout delimited by a sentinel so the
// parent process can separate user logs from the wrapper protocol.

"use strict";

const RESULT_SENTINEL = "__duck_fn_result__";

function emit(payload) {
  process.stdout.write(RESULT_SENTINEL + JSON.stringify(payload) + "\n");
}

function lineify(args) {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack || a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

async function main() {
  const startedOn = new Date().toISOString();
  const mainSpec = process.env.__FN_MAIN__ || "index.js";

  // Resolve the package entry relative to the package directory (cwd), not
  // to this wrapper's own location.
  const entry = require("path").resolve(process.cwd(), mainSpec);

  // Forward console output through the normal streams; the parent captures
  // stdout/stderr lines as logs.
  const handler = require(entry);

  const type = typeof handler;
  if (type !== "function" && type !== "object") {
    emit({
      successful: false,
      startedOn,
      endedOn: new Date().toISOString(),
      error: `package main '${mainSpec}' did not export a handler`,
    });
    return;
  }
  const fn = type === "object" && typeof handler.handler === "function" ? handler.handler : handler;
  if (typeof fn !== "function") {
    emit({
      successful: false,
      startedOn,
      endedOn: new Date().toISOString(),
      error: "package main must export a handler function (exports.handler)",
    });
    return;
  }

  let event = {};
  try {
    event = JSON.parse(process.env.__FN_EVENT__ || "{}");
  } catch {
    event = {};
  }

  const ctx = {
    functionName: process.env.__FN_ID__ || null,
    invokedAt: startedOn,
    remainingTimeInMillis: () => 4500,
  };

  try {
    const result = await fn(event, ctx);
    emit({
      successful: true,
      startedOn,
      endedOn: new Date().toISOString(),
      error: null,
    });
    void result;
  } catch (err) {
    emit({
      successful: false,
      startedOn,
      endedOn: new Date().toISOString(),
      error: err && err.message ? String(err.message).slice(0, 500) : "handler threw",
    });
  }
}

main().catch((err) => {
  emit({
    successful: false,
    startedOn: new Date().toISOString(),
    endedOn: new Date().toISOString(),
    error: err && err.message ? String(err.message).slice(0, 500) : "wrapper failure",
  });
});
