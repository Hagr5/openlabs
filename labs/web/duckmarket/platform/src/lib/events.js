"use strict";

// Account integration events.
//
// When a profile is updated, the platform emits a USER_CHANGED event and
// delivers it to any active account webhook configuration subscribed to that
// resource/action pair. Function destinations are executed in the managed
// runtime; the invocation record is attached to the function and to the
// webhook configuration's lastDelivery.

const repo = require("../db/repositories");
const runtimeClient = require("./runtime-client");
const logger = require("./logger");

const USER_CHANGED_DEBOUNCE_MS = 1000;

function emitUserChanged(user, { actorId, changedFields }) {
  const accountId = user.accountId;
  const payload = {
    id: `evt_${randomId()}`,
    type: "USER_CHANGED",
    occurredAt: new Date().toISOString(),
    account: { id: accountId },
    actor: { id: actorId },
    resource: {
      type: "USER",
      id: user.id,
      version: 1,
    },
    changedFields,
  };

  setTimeout(() => {
    dispatchToAccount(accountId, payload).catch((err) => {
      logger.error("webhook dispatch failed", { eventId: payload.id, reason: err.message });
    });
  }, USER_CHANGED_DEBOUNCE_MS);
}

async function dispatchToAccount(accountId, event) {
  const configs = repo.webhooks.findActiveForEvent(accountId, "USER", "CHANGED");
  for (const config of configs) {
    if (config.destinationType !== "FUNCTION" || !config.destinationFunctionId) {
      continue;
    }
    const fn = repo.functions.findById(config.destinationFunctionId);
    if (!fn) continue;
    if (fn.status !== "READY") continue;

    try {
      const result = await runtimeClient.executeFunction(fn.id, event);
      const invocation = repo.invocations.create({
        functionId: fn.id,
        successful: result.successful,
        startedOn: result.startedOn,
        endedOn: result.endedOn,
        error: result.error,
        logs: result.logs,
      });
      repo.webhooks.recordDelivery(config.id, invocation.id);
    } catch (err) {
      logger.warn("function destination invocation failed", {
        webhookId: config.id,
        functionId: fn.id,
        reason: err.message,
      });
      repo.invocations.create({
        functionId: fn.id,
        successful: false,
        startedOn: new Date().toISOString(),
        endedOn: new Date().toISOString(),
        error: "INTERNAL: invocation could not be completed",
        logs: [],
      });
    }
  }
}

function randomId() {
  const crypto = require("crypto");
  return crypto.randomBytes(10).toString("hex");
}

module.exports = { emitUserChanged };
