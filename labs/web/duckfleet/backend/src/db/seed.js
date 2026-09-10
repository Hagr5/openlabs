const crypto = require("crypto");

function hashPassword(password, saltHex) {
  return crypto
    .pbkdf2Sync(String(password), Buffer.from(saltHex, "hex"), 120000, 32, "sha256")
    .toString("hex");
}

const USERS = [
  {
    id: "a41f9c02-3d8b-4e5a-91f0-77c2b8e4d501",
    email: "dispatch@duckurity.example",
    displayName: "Mara Quill",
    role: "USER",
    password: "fleetflow-2024",
    salt: "01c4d8a2f7b34e519ac60bd83e71f05d",
  },
  {
    id: "b52e8d13-4c9a-4f6b-82e1-66d3c9f5e612",
    email: "routing@duckurity.example",
    displayName: "Devon Marsh",
    role: "USER",
    password: "routes-keep-moving-2210",
    salt: "12d5e9b3a8c45f62abd71ce94f82a16e",
  },
  {
    id: "c63f9e24-5dab-4a7c-93f2-55e4dab6f723",
    email: "maintenance@duckurity.example",
    displayName: "Iris Pond",
    role: "USER",
    password: "wrench-and-quack-7781",
    salt: "23e6fad4b9d56a73bce82dfa5a93b27f",
  },
  {
    id: "d74aaf35-6ebc-4b8d-a4a3-44f5ebc7a834",
    email: "billing@duckurity.example",
    displayName: "Theo Drake",
    role: "USER",
    password: "ledger-lane-3094",
    salt: "34f7abf5cad67b84cdf93eab6ba4c38a",
  },
  {
    id: "e85bbf46-7fcd-4c9e-b5b4-33a6fcd8b945",
    email: "ops-admin@duckurity.example",
    displayName: "Ops Admin",
    role: "ADMIN",
    password: null,
    salt: "45a8bc06dbe78c95deaa4fbc7cb5d49b",
  },
];

const VEHICLES = [
  { id: "veh-0001", name: "Mallard 01", status: "EN_ROUTE", zone: "harbor-north", driverName: "Priya Anand" },
  { id: "veh-0002", name: "Pintail 02", status: "IDLE", zone: "city-core", driverName: "Marcus Webb" },
  { id: "veh-0003", name: "Teal 03", status: "CHARGING", zone: "airport-loop", driverName: "Sofia Reyes" },
  { id: "veh-0004", name: "Gadwall 04", status: "EN_ROUTE", zone: "river-east", driverName: "Tomas Lindqvist" },
  { id: "veh-0005", name: "Wigeon 05", status: "MAINTENANCE", zone: "industrial-south", driverName: "Amara Okafor" },
  { id: "veh-0006", name: "Shoveler 06", status: "EN_ROUTE", zone: "suburbs-west", driverName: "Daniel Kim" },
  { id: "veh-0007", name: "Canvasback 07", status: "IDLE", zone: "old-town", driverName: "Elena Petrova" },
  { id: "veh-0008", name: "Redhead 08", status: "EN_ROUTE", zone: "harbor-north", driverName: "Yusuf Haddad" },
  { id: "veh-0009", name: "Scaup 09", status: "CHARGING", zone: "city-core", driverName: "Grace Ng" },
  { id: "veh-0010", name: "Merganser 10", status: "EN_ROUTE", zone: "airport-loop", driverName: "Oliver Bennett" },
  { id: "veh-0011", name: "Goldeneye 11", status: "IDLE", zone: "river-east", driverName: "Hana Sato" },
  { id: "veh-0012", name: "Bufflehead 12", status: "EN_ROUTE", zone: "industrial-south", driverName: "Rafael Duarte" },
];

function seed(db) {
  const insertUser = db.prepare(
    "INSERT INTO users (id, email, display_name, role, password_hash, salt, failed_attempts, locked_until, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)"
  );
  const insertVehicle = db.prepare(
    "INSERT INTO vehicles (id, name, status, zone, driver_name) VALUES (?, ?, ?, ?, ?)"
  );
  const now = Date.now();
  const seedAll = db.transaction(() => {
    for (const u of USERS) {
      const password = u.password === null ? crypto.randomBytes(32).toString("hex") : u.password;
      insertUser.run(u.id, u.email, u.displayName, u.role, hashPassword(password, u.salt), u.salt, now);
    }
    for (const v of VEHICLES) {
      insertVehicle.run(v.id, v.name, v.status, v.zone, v.driverName);
    }
  });
  seedAll();
}

module.exports = { seed, hashPassword, USERS, VEHICLES };
