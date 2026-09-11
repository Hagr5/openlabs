const grpc = require("@grpc/grpc-js");
const { packages } = require("./proto");
const authService = require("./services/auth");
const fleetService = require("./services/fleet");
const eventsService = require("./services/events");
const adminService = require("./services/admin");
const healthService = require("./services/health");
const { serverReflectionInfo, listServices } = require("./reflection");
const emitter = require("./emitter");

const PORT = process.env.GRPC_PORT || "50051";

function logRequest(call, method) {
  const started = Date.now();
  const peer = call.getPeer ? call.getPeer() : "unknown";
  const done = () => {
    const elapsed = Date.now() - started;
    process.stdout.write(`${new Date().toISOString()} ${peer} ${method} ${elapsed}ms\n`);
  };
  if (typeof call.on === "function") {
    call.on("error", done);
  }
  return done;
}

function wrapUnary(name, handler) {
  return (call, callback) => {
    const done = logRequest(call, name);
    handler(call, (err, value) => {
      done();
      callback(err, value);
    });
  };
}

function wrapStream(name, handler) {
  return (call) => {
    const done = logRequest(call, name);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done();
    };
    call.on("cancelled", finish);
    call.on("error", finish);
    try {
      handler(call);
    } catch (err) {
      finish();
      call.emit("error", { code: 13, details: "INTERNAL" });
    }
  };
}

function main() {
  if (!process.env.FLAG) {
    process.stderr.write("FLAG environment variable is required\n");
    process.exit(1);
  }

  const server = new grpc.Server({
    "grpc.max_receive_message_length": 1024 * 1024,
    "grpc.max_send_message_length": 1024 * 1024,
  });

  server.addService(packages.auth.AuthService.service, {
    login: wrapUnary("auth.AuthService/Login", authService.login),
    whoAmI: wrapUnary("auth.AuthService/WhoAmI", authService.whoAmI),
  });
  server.addService(packages.fleet.FleetService.service, {
    listVehicles: wrapUnary("fleet.FleetService/ListVehicles", fleetService.listVehicles),
    getVehicle: wrapUnary("fleet.FleetService/GetVehicle", fleetService.getVehicle),
  });
  server.addService(packages.events.EventService.service, {
    subscribe: wrapStream("events.EventService/Subscribe", eventsService.subscribe),
  });
  server.addService(packages.admin.AdminService.service, {
    getFlag: wrapUnary("admin.AdminService/GetFlag", adminService.getFlag),
    issueToken: wrapUnary("admin.AdminService/IssueToken", adminService.issueToken),
  });
  server.addService(packages.grpc.health.v1.Health.service, {
    check: wrapUnary("grpc.health.v1.Health/Check", healthService.check),
    watch: wrapStream("grpc.health.v1.Health/Watch", healthService.watch),
  });
  server.addService(packages.grpc.reflection.v1alpha.ServerReflection.service, {
    serverReflectionInfo: wrapStream(
      "grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo",
      serverReflectionInfo
    ),
  });

  server.bindAsync(
    `0.0.0.0:${PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        process.stderr.write(`bind failed: ${err.message}\n`);
        process.exit(1);
      }
      emitter.start();
      process.stdout.write(`duckfleet backend listening on :${port}\n`);
      process.stdout.write(`registered services: ${listServices().join(", ")}\n`);
    }
  );

  const shutdown = () => {
    server.tryShutdown(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main();
