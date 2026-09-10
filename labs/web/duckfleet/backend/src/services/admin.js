const { signToken, authenticate, TOKEN_TTL_SECONDS } = require("../lib/auth");
const db = require("../db");

function issueToken(call, callback) {
  let claims;
  try {
    claims = authenticate(call);
  } catch (err) {
    callback(err);
    return;
  }
  const internal = call.metadata.get("x-internal-call") || [];
  if (String(internal[0] || "").toLowerCase() !== "true") {
    callback({ code: 7, details: "FORBIDDEN" });
    return;
  }
  const request = call.request || {};
  const userId = typeof request.userId === "string" ? request.userId : "";
  const user = db.getUserById(userId);
  if (!user) {
    callback({ code: 3, details: "USER_NOT_FOUND" });
    return;
  }
  const token = signToken(user.id, user.role);
  callback(null, { token, expiresIn: TOKEN_TTL_SECONDS });
}

function getFlag(call, callback) {
  let claims;
  try {
    claims = authenticate(call);
  } catch (err) {
    callback(err);
    return;
  }
  if (claims.role !== "ADMIN") {
    callback({ code: 7, details: "ADMIN_ROLE_REQUIRED" });
    return;
  }
  const user = db.getUserById(claims.sub);
  callback(null, { flag: process.env.FLAG || "", issuedTo: user ? user.email : claims.sub });
}

module.exports = { issueToken, getFlag };
