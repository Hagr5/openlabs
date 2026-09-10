const fs = require("fs");
const path = require("path");
const protobuf = require("protobufjs");

const protosDir = process.argv[2] || path.join(__dirname, "..", "..", "protos");
const outFile =
  process.argv[3] || path.join(__dirname, "..", "public", "descriptors.js");

const root = new protobuf.Root();
root.loadSync([path.join(protosDir, "auth.proto"), path.join(protosDir, "fleet.proto")], {
  keepCase: false,
});
root.resolveAll();

const json = root.toJSON({ keepCase: false });

const trimmed = { nested: {} };
if (json.nested && json.nested.auth) trimmed.nested.auth = json.nested.auth;
if (json.nested && json.nested.fleet) trimmed.nested.fleet = json.nested.fleet;
const empty =
  json.nested &&
  json.nested.google &&
  json.nested.google.nested &&
  json.nested.google.nested.protobuf &&
  json.nested.google.nested.protobuf.nested &&
  json.nested.google.nested.protobuf.nested.Empty;
if (empty) {
  trimmed.nested.google = { nested: { protobuf: { nested: { Empty: empty } } } };
}

const check = protobuf.Root.fromJSON(trimmed);
for (const name of [
  "auth.AuthService",
  "auth.LoginRequest",
  "auth.LoginResponse",
  "auth.UserInfo",
  "fleet.FleetService",
  "fleet.Vehicle",
  "google.protobuf.Empty",
]) {
  check.lookup(name);
}

const body =
  "window.DUCKFLEET_PUBLIC_DESCRIPTORS = " + JSON.stringify(trimmed) + ";\n";
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, body);
process.stdout.write(`wrote ${outFile}\n`);
