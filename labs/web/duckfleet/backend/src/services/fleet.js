const db = require("../db");
const { authenticate } = require("../lib/auth");

function requireSession(call, callback) {
  try {
    return authenticate(call);
  } catch (err) {
    callback(err);
    return null;
  }
}

function listVehicles(call, callback) {
  if (!requireSession(call, callback)) return;
  const request = call.request || {};
  const zone = typeof request.zone === "string" && request.zone.length > 0 ? request.zone : undefined;
  const vehicles = db.listVehicles(zone);
  callback(null, { vehicles, total: vehicles.length });
}

function getVehicle(call, callback) {
  if (!requireSession(call, callback)) return;
  const request = call.request || {};
  const id = typeof request.id === "string" ? request.id : "";
  if (id.length === 0) {
    callback({ code: 3, details: "INVALID_VEHICLE_ID" });
    return;
  }
  const vehicle = db.getVehicleById(id);
  if (!vehicle) {
    callback({ code: 5, details: "VEHICLE_NOT_FOUND" });
    return;
  }
  callback(null, vehicle);
}

module.exports = { listVehicles, getVehicle };
