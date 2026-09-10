const path = require("path");
const loader = require("@grpc/proto-loader");
const grpc = require("@grpc/grpc-js");
const protobuf = require("protobufjs");

const PROTO_DIR = process.env.PROTO_DIR || path.join(__dirname, "..", "..", "protos");

const LOAD_OPTIONS = {
  keepCase: false,
  longs: Number,
  enums: Number,
  bytes: Buffer,
  defaults: false,
  oneofs: true,
  includeDirs: [PROTO_DIR],
};

const FILES = [
  "auth.proto",
  "fleet.proto",
  "events.proto",
  "admin.proto",
  "grpc/health/v1/health.proto",
  "grpc/reflection/v1alpha/reflection.proto",
];

const packageDefinition = loader.loadSync(
  FILES.map((f) => path.join(PROTO_DIR, f)),
  LOAD_OPTIONS
);

const packages = grpc.loadPackageDefinition(packageDefinition);

const codecRoot = new protobuf.Root();
codecRoot.loadSync(
  FILES.map((f) => path.join(PROTO_DIR, f)),
  { keepCase: false }
);
codecRoot.resolveAll();

function lookupType(fullName) {
  return codecRoot.lookupType(fullName);
}

module.exports = { packages, PROTO_DIR, lookupType };
