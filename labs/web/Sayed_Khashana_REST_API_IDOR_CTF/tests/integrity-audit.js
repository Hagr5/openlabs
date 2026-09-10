"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const forbidden = /SK-CTF\{/;
for (const file of fs.readdirSync(publicDir)) {
  const content = fs.readFileSync(path.join(publicDir, file), "utf8");
  assert(!forbidden.test(content), `Flag literal found in public asset: ${file}`);
}
for (const file of ["Dockerfile", "docker-compose.yml", ".dockerignore"]) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  assert(!forbidden.test(content), `Flag literal found in container configuration: ${file}`);
}
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
assert(!forbidden.test(server), "Flag literal found in server source");
assert(!/\/api\/debug|directory listing|sendFile\(/i.test(server), "Unexpected debug or file-serving route detected");
console.log("PASS: no flag literal in public assets, container configuration, or server source; no debug/file shortcut signatures detected.");
