"use strict";

const crypto = require("crypto");
const repo = require("../db/repositories");
const runtimeClient = require("../lib/runtime-client");
const entitlements = require("../lib/entitlements");
const logger = require("../lib/logger");

function toIsoOrNull(value) {
  return value || null;
}

function toFunctionGql(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    active: !!row.active,
    status: row.status,
    runtime: row.runtime,
    codeFile: row.uploadToken
      ? { __typename: "StagedFile", uploadLink: `/api/file-management/staged/${row.uploadToken}` }
      : { __typename: "UploadedFile", fileName: row.codeFileName },
    lastInvocationId: row.lastInvocationId || null,
  };
}

// Enrich with latest invocation on demand.
function withLastInvocation(gqlFn) {
  if (!gqlFn) return null;
  const rows = getDb()
    .prepare(
      "SELECT id FROM function_invocations WHERE functionId = ? ORDER BY startedOn DESC LIMIT 1"
    )
    .all(gqlFn.id);
  gqlFn.lastInvocationId = rows.length ? rows[0].id : null;
  return gqlFn;
}

function getDb() {
  return require("../db").getDb();
}

function toInvocationGql(row) {
  if (!row) return null;
  let logs = [];
  try {
    logs = JSON.parse(row.logs);
  } catch {
    logs = [];
  }
  return {
    id: row.id,
    successful: !!row.successful,
    startedOn: row.startedOn,
    endedOn: row.endedOn,
    error: row.error,
    logs: logs.map((l) => ({ timestamp: l.timestamp, message: l.message })),
  };
}

function toWebhookGql(row) {
  if (!row) return null;
  let actions = [];
  try {
    actions = JSON.parse(row.resourceActions);
  } catch {
    actions = [];
  }
  const gql = {
    id: row.id,
    status: row.status,
    resourceType: row.resourceType,
    resourceActions: actions,
    destination:
      row.destinationType === "FUNCTION" && row.destinationFunctionId
        ? { functionId: row.destinationFunctionId }
        : null,
    lastDeliveryId: row.lastDeliveryId || null,
  };
  return gql;
}

function requireUser(context) {
  if (!context.user) {
    throw new Error("UNAUTHENTICATED");
  }
  return context.user;
}

function assertFunctionAccess(user, fn) {
  // Owner or administrator. This mirrors the REST-level profile checks.
  return user.accountId === fn.accountId || entitlements.isAdmin(user);
}

const Query = {
  viewer: async (_, __, context) => {
    const user = context.user;
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      locale: user.locale,
      role: user.role,
    };
  },
  function: async (_, { id }, context) => {
    const user = requireUser(context);
    const fn = repo.functions.findById(id);
    if (!fn) return null;
    if (!assertFunctionAccess(user, fn)) {
      throw new Error(
        "FORBIDDEN: functions may only be accessed by their owning account"
      );
    }
    return withLastInvocation(toFunctionGql(fn));
  },
  functions: async (_, args, context) => {
    const user = requireUser(context);
    const first = Math.min(Math.max(args.first || 20, 1), 100);
    const { rows, hasMore } = repo.functions.listByAccount(user.accountId, {
      first,
      after: args.after,
    });
    const edges = rows.map((row) => ({
      node: withLastInvocation(toFunctionGql(row)),
      cursor: row.createdAt,
    }));
    return {
      edges,
      pageInfo: { hasNextPage: hasMore, endCursor: edges.length ? edges[edges.length - 1].cursor : null },
      totalCount: repo.functions.countByAccount(user.accountId),
    };
  },
  webhookConfigurations: async (_, args, context) => {
    const user = requireUser(context);
    const first = Math.min(Math.max(args.first || 20, 1), 100);
    const { rows, hasMore } = repo.webhooks.listByAccount(user.accountId, {
      first,
      after: args.after,
    });
    const edges = rows.map((row) => ({
      node: toWebhookGql(row),
      cursor: row.createdAt,
    }));
    return {
      edges,
      pageInfo: { hasNextPage: hasMore, endCursor: edges.length ? edges[edges.length - 1].cursor : null },
      totalCount: repo.webhooks.countByAccount(user.accountId),
    };
  },
};

const Mutation = {
  createAccountFunction: async (_, { input }, context) => {
    const user = requireUser(context);
    const errors = [];

    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{1,63}$/.test(name)) {
      errors.push({
        message:
          "name must be 2-64 characters and may contain letters, digits, spaces, underscores and dashes",
        path: ["name"],
      });
    }
    const codeFileName = typeof input.codeFileName === "string" ? input.codeFileName.trim() : "";
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,127}\.(js|json|zip)$/.test(codeFileName)) {
      errors.push({
        message: "codeFileName must refer to a .js, .json or .zip file",
        path: ["codeFileName"],
      });
    }
    const active = input.active === undefined ? true : !!input.active;

    const existingCount = repo.functions.countByAccount(user.accountId);
    if (existingCount >= 10) {
      errors.push({
        message: "account has reached the maximum number of functions (10) for the preview",
        path: ["name"],
      });
    }

    const duplicate =
      name &&
      getDb()
        .prepare("SELECT id FROM functions WHERE accountId = ? AND name = ?")
        .get(user.accountId, name);
    if (duplicate) {
      errors.push({ message: "a function with this name already exists", path: ["name"] });
    }

    if (errors.length) {
      return { accountFunction: null, userErrors: errors };
    }

    const row = repo.functions.create({
      accountId: user.accountId,
      name,
      codeFileName,
      active,
    });
    return { accountFunction: withLastInvocation(toFunctionGql(row)), userErrors: [] };
  },

  deleteAccountFunction: async (_, { id }, context) => {
    const user = requireUser(context);
    const fn = repo.functions.findById(id);
    if (!fn) {
      return { id: null, userErrors: [{ message: "function not found", path: ["id"] }] };
    }
    if (!assertFunctionAccess(user, fn)) {
      return {
        id: null,
        userErrors: [
          {
            message: "FORBIDDEN: functions may only be managed by their owning account",
            path: ["id"],
          },
        ],
      };
    }
    repo.functions.deleteById(id);
    return { id, userErrors: [] };
  },

  invokeFunction: async (_, { id }, context) => {
    const user = requireUser(context);
    const fn = repo.functions.findById(id);
    if (!fn) {
      return { invocation: null, userErrors: [{ message: "function not found", path: ["id"] }] };
    }
    if (!assertFunctionAccess(user, fn)) {
      return {
        invocation: null,
        userErrors: [
          {
            message: "FORBIDDEN: functions may only be invoked by their owning account",
            path: ["id"],
          },
        ],
      };
    }
    // Direct invocation is restricted to the Functions pilot entitlement.
    if (!entitlements.hasFunctionsEntitlement(user)) {
      return {
        invocation: null,
        userErrors: [
          {
            message:
              "FORBIDDEN: invoking account functions requires the Functions pilot entitlement",
            path: ["id"],
          },
        ],
      };
    }
    if (fn.status !== "READY") {
      return {
        invocation: null,
        userErrors: [
          {
            message: `function is not READY (current status: ${fn.status})`,
            path: ["id"],
          },
        ],
      };
    }

    try {
      const result = await runtimeClient.executeFunction(fn.id, {
        id: `evt_${crypto.randomBytes(10).toString("hex")}`,
        type: "DIRECT_INVOCATION",
        occurredAt: new Date().toISOString(),
      });
      const invocation = repo.invocations.create({
        functionId: fn.id,
        successful: result.successful,
        startedOn: result.startedOn,
        endedOn: result.endedOn,
        error: result.error,
        logs: result.logs,
      });
      return { invocation: toInvocationGql(invocation), userErrors: [] };
    } catch (err) {
      logger.warn("direct invocation failed", { functionId: fn.id, reason: err.message });
      const invocation = repo.invocations.create({
        functionId: fn.id,
        successful: false,
        startedOn: new Date().toISOString(),
        endedOn: new Date().toISOString(),
        error: "INTERNAL: invocation could not be completed",
        logs: [],
      });
      return { invocation: toInvocationGql(invocation), userErrors: [] };
    }
  },

  createAccountWebhookConfiguration: async (_, { input }, context) => {
    const user = requireUser(context);
    const errors = [];

    const resourceType = input.resourceType;
    if (resourceType !== "USER") {
      errors.push({
        message: "resourceType USER is the only resource type supported in the preview",
        path: ["resourceType"],
      });
    }
    const actions = Array.isArray(input.resourceActions) ? input.resourceActions : [];
    if (actions.length === 0 || actions.some((a) => a !== "CHANGED")) {
      errors.push({
        message: "resourceActions must be a non-empty list containing CHANGED",
        path: ["resourceActions"],
      });
    }

    let destinationType = "NONE";
    let destinationFunctionId = null;
    const destination = input.destination || null;
    if (destination) {
      const keys = Object.keys(destination);
      if (keys.includes("functionId") && destination.functionId) {
        const fn = repo.functions.findById(destination.functionId);
        if (!fn || !assertFunctionAccess(user, fn)) {
          errors.push({
            message: "destination functionId refers to a function outside this account",
            path: ["destination", "functionId"],
          });
        } else {
          destinationType = "FUNCTION";
          destinationFunctionId = fn.id;
        }
      } else if (keys.length > 0) {
        // HTTP-URL destinations are not part of the preview yet.
        errors.push({
          message:
            "http destinations are not supported yet - webhook destinations support functions only (http is coming soon)",
          path: ["destination"],
        });
      } else {
        errors.push({
          message: "destination must specify either a functionId or an http url",
          path: ["destination"],
        });
      }
    }

    const existingCount = repo.webhooks.countByAccount(user.accountId);
    if (existingCount >= 10) {
      errors.push({
        message: "account has reached the maximum number of webhook configurations (10)",
        path: ["resourceType"],
      });
    }

    if (errors.length) {
      return { webhookConfiguration: null, userErrors: errors };
    }

    const row = repo.webhooks.create({
      accountId: user.accountId,
      resourceType,
      resourceActions: actions,
      destinationType,
      destinationFunctionId,
    });
    return { webhookConfiguration: toWebhookGql(row), userErrors: [] };
  },

  deleteAccountWebhookConfiguration: async (_, { id }, context) => {
    const user = requireUser(context);
    const config = repo.webhooks.findById(id);
    if (!config) {
      return { id: null, userErrors: [{ message: "webhook configuration not found", path: ["id"] }] };
    }
    if (config.accountId !== user.accountId && !entitlements.isAdmin(user)) {
      return {
        id: null,
        userErrors: [
          {
            message: "FORBIDDEN: webhook configurations may only be managed by their owning account",
            path: ["id"],
          },
        ],
      };
    }
    repo.webhooks.deleteById(id);
    return { id, userErrors: [] };
  },
};

// Field-level resolvers for nested objects.
const AccountFunction = {
  lastInvocation: (parent) => {
    if (!parent.lastInvocationId) return null;
    const row = getDb()
      .prepare("SELECT * FROM function_invocations WHERE id = ?")
      .get(parent.lastInvocationId);
    return toInvocationGql(row);
  },
};

const WebhookConfiguration = {
  lastDelivery: (parent) => {
    if (!parent.lastDeliveryId) return null;
    return { id: parent.lastDeliveryId };
  },
};

const DeliveryRecord = {
  invocation: (parent) => {
    const row = getDb()
      .prepare("SELECT * FROM function_invocations WHERE id = ?")
      .get(parent.id);
    return toInvocationGql(row);
  },
};

const resolvers = {
  CodeFile: {
    __resolveType(obj) {
      return obj.__typename;
    },
  },
  DateTime: {
    serialize: (value) => (value instanceof Date ? value.toISOString() : String(value)),
    parseValue: (value) => new Date(value),
    parseLiteral: (ast) =>
      ast.kind === "StringValue" ? new Date(ast.value) : undefined,
  },
  Query,
  Mutation,
  AccountFunction,
  WebhookConfiguration,
  DeliveryRecord,
};

module.exports = resolvers;
