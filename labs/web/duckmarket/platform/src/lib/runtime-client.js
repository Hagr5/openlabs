"use strict";

const config = require("../config");

async function runtimeFetch(pathname, options = {}) {
  const url = new URL(pathname, config.runtime.baseUrl);
  const res = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-runtime-key": config.runtime.sharedKey,
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs || 15000),
  });
  return res;
}

async function provisionFunction(functionId, zipBase64, fileName) {
  const res = await runtimeFetch("/v1/provision", {
    method: "POST",
    body: JSON.stringify({ functionId, zipBase64, fileName }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`runtime provisioning failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function executeFunction(functionId, event) {
  const res = await runtimeFetch("/v1/execute", {
    method: "POST",
    body: JSON.stringify({ functionId, event }),
    timeoutMs: 20000,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`runtime execution failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function runtimeHealth() {
  try {
    const res = await runtimeFetch("/v1/healthz", { method: "GET", timeoutMs: 3000 });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = { provisionFunction, executeFunction, runtimeHealth };
