const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const serveIndex = require('serve-index');
const { graphqlHTTP } = require('express-graphql');
const { NoSchemaIntrospectionCustomRule } = require('graphql');

const restRouter = require('./src/rest');
const authLib = require('./src/auth');
const gqlV1 = require('./src/graphql/schemaV1');
const gqlV2 = require('./src/graphql/schemaV2');
const grpcServer = require('./src/grpc/grpcServer');

const HTTP_PORT = process.env.HTTP_PORT || 3000;
const GRPC_PORT = process.env.GRPC_PORT || 50051;

const app = express();
app.use(cors());
app.use(bodyParser.json());

function gqlContext(req) {
  const token = authLib.extractBearer(req);
  if (!token) return { user: null };
  try {
    return { user: authLib.verifyStrict(token) };
  } catch (e) {
    return { user: null };
  }
}

// --- REST API ---
app.use('/api', restRouter);

// --- GraphQL landing page ---
// A plain visit to the base /graphql path lists the available versions,
// so a player who fuzzes their way to "graphql" (rather than a full
// "graphql/v1" guess) still finds both versions from here.
app.get(['/graphql', '/graph'], (req, res) => {
  res.type('html').send(`
    <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 80px auto; color: #c9d1d9; background:#0d1117; padding: 32px; border-radius: 10px; border: 1px solid #30363d;">
      <h1 style="color:#f0f0f0;">GraphQL API</h1>
      <p>Available versions:</p>
      <ul>
        <li><a href="/graph/v1" style="color:#58a6ff;">v1</a></li>
        <li><a href="/graph/v2" style="color:#58a6ff;">v2</a></li>
      </ul>
    </div>
  `);
});

// --- GraphQL v1 (legacy, introspection left enabled) ---
// A plain browser visit (GET, no query param) now falls straight through
// to graphqlHTTP below, which renders the GraphiQL IDE (graphiql: true).
// Actual GraphQL usage (POST, or GET with an explicit ?query=) is
// unaffected either way.
app.use(
  '/graph/v1',
  graphqlHTTP(req => ({
    schema: gqlV1.schema,
    rootValue: gqlV1.root,
    context: gqlContext(req),
    graphiql: {
      defaultQuery: `{
  __schema {
    types {
      name
    }
  }
}`
    },
    extensions: ({ document, result }) => {
      const isIntrospection = document && document.loc && document.loc.source.body.includes('__schema');
      if (isIntrospection && result && result.data) {
        return {
          tip: 'You can work with this schema more effectively via https://apis.guru/graphql-voyager/'
        };
      }
      return undefined;
    }
  }))
);

// --- GraphQL v2 (current, introspection disabled) ---
// A plain browser visit gets a firm access-denied notice, reinforcing
// that v2 is the hardened, actively-guarded version.
app.get('/graph/v2', (req, res, next) => {
  if (req.query.query) return next();
  res.status(403).type('html').send(`
    <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 80px auto; color: #c9d1d9; background:#0d1117; padding: 32px; border-radius: 10px; border: 1px solid #f85149;">
      <h1 style="color:#f85149;">Access Denied</h1>
      <p>This is a restricted, actively monitored endpoint. You are not authorized to browse it directly.</p>
    </div>
  `);
});
app.use(
  '/graph/v2',
  graphqlHTTP(req => ({
    schema: gqlV2.schema,
    rootValue: gqlV2.root,
    context: gqlContext(req),
    graphiql: false,
    validationRules: [NoSchemaIntrospectionCustomRule]
  }))
);

// --- Static frontend ---
// Misconfiguration: directory listing left enabled on a single top-level
// backup folder. Discoverable in one fuzz pass directly against the root
// (e.g. wordlist entry "backup"). Freely reachable at any time - this
// stage is independent of REST/GraphQL, so nothing gates discovery here.
app.use(
  '/backup',
  serveIndex(path.join(__dirname, 'src', 'private', 'backup'), { icons: false })
);
app.use('/backup', express.static(path.join(__dirname, 'src', 'private', 'backup')));
app.use(express.static(path.join(__dirname, 'src', 'public')));
app.use((req, res) => {
  res.status(404).type('text/plain').send('404 Not Found');
});

app.listen(HTTP_PORT, () => {
  console.log(`Server started on port ${HTTP_PORT}`);
});

grpcServer.start(GRPC_PORT);
