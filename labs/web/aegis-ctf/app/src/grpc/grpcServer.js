const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const auth = require('../auth');
const challengeState = require('../state');

const PROTO_PATH = path.join(__dirname, 'admin_service.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const proto = grpc.loadPackageDefinition(packageDef).aegis;

function getMetadataToken(call) {
  const md = call.metadata.get('authorization');
  if (!md || md.length === 0) return null;
  const value = md[0];
  const [scheme, token] = String(value).split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

function getSystemStatus(call, callback) {
  const token = getMetadataToken(call);
  if (!token) {
    return callback({ code: grpc.status.UNAUTHENTICATED, message: 'missing bearer token in metadata' });
  }
  try {
    // Uses the VULNERABLE verifier: alg:none tokens are trusted as-is.
    auth.verifyGrpcToken(token);
  } catch (e) {
    return callback({ code: grpc.status.UNAUTHENTICATED, message: 'invalid token' });
  }
  callback(null, { status: 'ok', serviceVersion: 'admin-service/1.4.2-internal' });
}

function getPasswordFragment(call, callback) {
  const token = getMetadataToken(call);
  if (!token) {
    return callback({ code: grpc.status.UNAUTHENTICATED, message: 'missing bearer token in metadata' });
  }

  let claims;
  try {
    // VULNERABILITY (Broken Authentication): the interceptor trusts an
    // unsigned ("alg": "none") JWT and reads the `role` claim directly
    // from the forged payload, with no signature verification at all.
    claims = auth.verifyGrpcToken(token);
  } catch (e) {
    return callback({ code: grpc.status.UNAUTHENTICATED, message: 'invalid token' });
  }

  if (claims.role !== 'admin') {
    return callback({ code: grpc.status.PERMISSION_DENIED, message: 'insufficient privileges' });
  }

  const result = challengeState.completeGrpc();
  callback(null, { fragment: result.fragment, hint: result.hint || '' });
}

function start(port) {
  const server = new grpc.Server();
  server.addService(proto.AdminService.service, {
    GetSystemStatus: getSystemStatus,
    GetPasswordFragment: getPasswordFragment
  });
  server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
    if (err) {
      console.error('gRPC server failed to bind:', err);
      return;
    }
    console.log('Internal service started.');
  });
  return server;
}

module.exports = { start };
