const KNOWN = new Set([
  "",
  "auth.AuthService",
  "fleet.FleetService",
  "events.EventService",
  "admin.AdminService",
  "grpc.health.v1.Health",
  "grpc.reflection.v1alpha.ServerReflection",
]);

function statusFor(service) {
  if (service === "" || KNOWN.has(service)) return 1;
  return 3;
}

function check(call, callback) {
  const request = call.request || {};
  const service = typeof request.service === "string" ? request.service : "";
  if (!KNOWN.has(service)) {
    callback({ code: 5, details: "SERVICE_UNKNOWN" });
    return;
  }
  callback(null, { status: statusFor(service) });
}

function watch(call) {
  const request = call.request || {};
  call.write({ status: statusFor(typeof request.service === "string" ? request.service : "") });
  call.on("cancelled", () => {
    try {
      call.end();
    } catch (err) {
      // stream already torn down
    }
  });
}

module.exports = { check, watch };
