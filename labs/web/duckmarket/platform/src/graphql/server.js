"use strict";

const { ApolloServer } = require("@apollo/server");
const { expressMiddleware } = require("@apollo/server/express4");
const { GraphQLError } = require("graphql");
const typeDefs = require("./schema");
const resolvers = require("./resolvers");
const logger = require("../lib/logger");

async function createGraphQLApp() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true,
    formatError(formattedError) {
      // Mask internal error details; keep intentional user-facing messages.
      if (formattedError.message.startsWith("FORBIDDEN")) {
        return { message: formattedError.message, path: formattedError.path };
      }
      if (formattedError.message === "UNAUTHENTICATED") {
        return { message: "UNAUTHENTICATED: authentication required", path: formattedError.path };
      }
      if (formattedError.extensions && formattedError.extensions.code === "BAD_USER_INPUT") {
        return { message: formattedError.message, path: formattedError.path };
      }
      logger.warn("graphql error", { message: formattedError.message });
      return { message: "INTERNAL: an unexpected error occurred", path: formattedError.path };
    },
  });

  await server.start();

  const handler = expressMiddleware(server, {
    context: async ({ req }) => ({ user: req.user, session: req.session }),
  });

  // Wrap the Apollo express middleware into a plain Connect-style handler.
  return (req, res, next) => {
    // Interactive dev console on GET.
    if (req.method === "GET" && acceptsHtml(req)) {
      return sendGraphiql(req, res);
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    if (req.method !== "POST") {
      return res.status(405).json({ error: "METHOD_NOT_ALLOWED", message: "Use POST for GraphQL." });
    }
    return handler(req, res, next);
  };
}

function acceptsHtml(req) {
  const accept = req.headers.accept || "";
  return accept.includes("text/html");
}

function sendGraphiql(req, res) {
  // The bundled GraphiQL console served from the platform's public assets.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>DuckMarket - API Console (Preview)</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; }
  #console { display: flex; height: 100vh; }
  .pane { flex: 1; padding: 16px; border-right: 1px solid #ddd; overflow: auto; }
  textarea, pre { width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 13px; }
  button { padding: 6px 14px; margin-top: 8px; cursor: pointer; }
  h1 { font-size: 16px; }
</style>
</head>
<body>
<div id="console">
  <div class="pane">
    <h1>Query (send with your browser session)</h1>
    <textarea id="query" rows="18">{ viewer { id email role } }</textarea><br/>
    <button id="run">Run query</button>
  </div>
  <div class="pane">
    <h1>Response</h1>
    <pre id="response">Press Run.</pre>
  </div>
</div>
<script>
  const queryEl = document.getElementById('query');
  const responseEl = document.getElementById('response');
  document.getElementById('run').addEventListener('click', async () => {
    const csrf = (document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1];
    const res = await fetch('/api/graphql/preview', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'x-xsrf-token': csrf } : {})
      },
      body: JSON.stringify({ query: queryEl.value })
    });
    const body = await res.text();
    responseEl.textContent = 'HTTP ' + res.status + '\\n\\n' + body;
  });
</script>
</body>
</html>`;
  res.type("html").send(html);
}

module.exports = { createGraphQLApp };
