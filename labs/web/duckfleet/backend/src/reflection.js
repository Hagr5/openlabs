const fs = require("fs");
const path = require("path");
const protobuf = require("protobufjs");

const SET_PATH =
  process.env.PROTO_DESCRIPTOR_SET || path.join(__dirname, "..", "..", "proto-descriptors.bin");

const descriptorRoot = protobuf.loadSync(
  require.resolve("protobufjs/google/protobuf/descriptor.proto")
);
const FileDescriptorSet = descriptorRoot.lookupType("google.protobuf.FileDescriptorSet");
const FileDescriptorProto = descriptorRoot.lookupType("google.protobuf.FileDescriptorProto");

const set = FileDescriptorSet.decode(fs.readFileSync(SET_PATH));

const files = {};
const symbolToFile = {};

function fqn(pkg, name) {
  return pkg ? `${pkg}.${name}` : name;
}

function registerNested(file, prefix, nested) {
  for (const m of nested.messageType || []) {
    const name = `${prefix}.${m.name}`;
    symbolToFile[name] = file.name;
    registerNested(file, name, m);
  }
  for (const e of nested.enumType || []) {
    symbolToFile[`${prefix}.${e.name}`] = file.name;
    for (const v of e.value || []) {
      symbolToFile[`${prefix}.${e.name}.${v.name}`] = file.name;
      symbolToFile[`${prefix}.${v.name}`] = file.name;
    }
  }
}

for (const file of set.file) {
  files[file.name] = {
    proto: file,
    bytes: Buffer.from(FileDescriptorProto.encode(file).finish()),
  };
  const pkg = file.package || "";
  for (const service of file.service || []) {
    symbolToFile[fqn(pkg, service.name)] = file.name;
    for (const method of service.method || []) {
      symbolToFile[fqn(pkg, `${service.name}.${method.name}`)] = file.name;
    }
  }
  for (const m of file.messageType || []) {
    symbolToFile[fqn(pkg, m.name)] = file.name;
    registerNested(file, fqn(pkg, m.name), m);
  }
  for (const e of file.enumType || []) {
    symbolToFile[fqn(pkg, e.name)] = file.name;
  }
}

function listServices() {
  const names = new Set();
  for (const file of Object.values(files)) {
    const pkg = file.proto.package || "";
    for (const service of file.proto.service || []) {
      names.add(fqn(pkg, service.name));
    }
  }
  return Array.from(names).sort();
}

function fileChain(name) {
  const seen = new Set();
  const ordered = [];
  function visit(fileName) {
    if (seen.has(fileName)) return;
    const file = files[fileName];
    if (!file) return;
    seen.add(fileName);
    for (const dep of file.proto.dependency || []) {
      visit(dep);
    }
    ordered.push(file.bytes);
  }
  visit(name);
  return ordered;
}

function fileForSymbol(symbol) {
  const name = symbolToFile[symbol];
  if (!name) return null;
  return fileChain(name);
}

function fileByName(name) {
  if (!files[name]) return null;
  return fileChain(name);
}

function serverReflectionInfo(call) {
  call.on("data", (request) => {
    const response = { validHost: request.host || "", originalRequest: request };
    try {
      const selector = request.messageRequest;
      if (selector === "listServices") {
        response.listServicesResponse = {
          service: listServices().map((name) => ({ name })),
        };
      } else if (selector === "fileContainingSymbol") {
        const chain = fileForSymbol(request.fileContainingSymbol || "");
        if (!chain) {
          response.errorResponse = {
            errorCode: 5,
            errorMessage: `symbol not found: ${request.fileContainingSymbol || ""}`,
          };
        } else {
          response.fileDescriptorResponse = { fileDescriptorProto: chain };
        }
      } else if (selector === "fileByFilename") {
        const chain = fileByName(request.fileByFilename || "");
        if (!chain) {
          response.errorResponse = {
            errorCode: 5,
            errorMessage: `file not found: ${request.fileByFilename || ""}`,
          };
        } else {
          response.fileDescriptorResponse = { fileDescriptorProto: chain };
        }
      } else {
        response.errorResponse = { errorCode: 12, errorMessage: "request type not supported" };
      }
    } catch (err) {
      response.errorResponse = { errorCode: 13, errorMessage: "reflection failed" };
    }
    call.write(response);
  });
  call.on("end", () => {
    try {
      call.end();
    } catch (err) {
      // stream already torn down
    }
  });
}

module.exports = { serverReflectionInfo, listServices };
