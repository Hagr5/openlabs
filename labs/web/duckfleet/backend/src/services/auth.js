const db = require("../db");
const { signToken, authenticate, verifyPassword, TOKEN_TTL_SECONDS } = require("../lib/auth");

function login(call, callback) {
  const request = call.request || {};
  const email = typeof request.email === "string" ? request.email.trim() : "";
  const password = typeof request.password === "string" ? request.password : "";
  const user = db.getUserByEmail(email);
  if (!user || db.isLocked(user) || !verifyPassword(password, user)) {
    if (user && !db.isLocked(user)) {
      db.recordLoginFailure(user);
    }
    callback({ code: 16, details: "INVALID_CREDENTIALS" });
    return;
  }
  db.recordLoginSuccess(user.id);
  const token = signToken(user.id, user.role);
  callback(null, { token, tokenType: "Bearer", expiresIn: TOKEN_TTL_SECONDS });
}

function whoAmI(call, callback) {
  let claims;
  try {
    claims = authenticate(call);
  } catch (err) {
    callback(err);
    return;
  }
  const user = db.getUserById(claims.sub);
  if (!user) {
    callback({ code: 16, details: "INVALID_TOKEN" });
    return;
  }
  callback(null, {
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
  });
}

module.exports = { login, whoAmI };
