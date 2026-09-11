(function () {
  "use strict";

  var root = protobuf.Root.fromJSON(window.DUCKFLEET_PUBLIC_DESCRIPTORS);
  var LoginRequest = root.lookupType("auth.LoginRequest");
  var LoginResponse = root.lookupType("auth.LoginResponse");
  var EmptyMessage = root.lookupType("google.protobuf.Empty");
  var UserInfo = root.lookupType("auth.UserInfo");
  var ListVehiclesRequest = root.lookupType("fleet.ListVehiclesRequest");
  var ListVehiclesResponse = root.lookupType("fleet.ListVehiclesResponse");

  var GRPC_WEB_TEXT = "application/grpc-web-text+proto";
  var SESSION_KEY = "duckfleet.session";
  var REFRESH_MS = 10000;

  function bytesToB64(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) {
      s += String.fromCharCode(bytes[i]);
    }
    return btoa(s);
  }

  function b64ToBytes(text) {
    var clean = String(text || "").replace(/\s+/g, "");
    if (clean.length === 0) return new Uint8Array(0);
    var s = atob(clean);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) {
      out[i] = s.charCodeAt(i);
    }
    return out;
  }

  function toFrame(payload) {
    var out = new Uint8Array(5 + payload.length);
    out[0] = 0x00;
    new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(1, payload.length, false);
    out.set(payload, 5);
    return out;
  }

  function readFrames(bytes) {
    var data = [];
    var status = null;
    var message = "";
    var offset = 0;
    while (offset < bytes.length) {
      var kind = bytes[offset];
      var length =
        (bytes[offset + 1] * 16777216) +
        (bytes[offset + 2] * 65536) +
        (bytes[offset + 3] * 256) +
        bytes[offset + 4];
      var payload = bytes.slice(offset + 5, offset + 5 + length);
      if (kind === 0x00) {
        data.push(payload);
      } else if (kind === 0x80) {
        var text = "";
        for (var i = 0; i < payload.length; i++) {
          text += String.fromCharCode(payload[i]);
        }
        var lines = text.split("\r\n");
        for (var j = 0; j < lines.length; j++) {
          var idx = lines[j].indexOf(":");
          if (idx === -1) continue;
          var key = lines[j].slice(0, idx).trim().toLowerCase();
          var value = lines[j].slice(idx + 1).trim();
          if (key === "grpc-status") status = parseInt(value, 10);
          if (key === "grpc-message") message = decodeURIComponent(value);
        }
      }
      offset += 5 + length;
    }
    return { data: data, status: status === null ? 0 : status, message: message };
  }

  function grpcCall(serviceMethod, payload, token) {
    var headers = { "Content-Type": GRPC_WEB_TEXT };
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch("/api/grpc/" + serviceMethod, {
      method: "POST",
      headers: headers,
      body: bytesToB64(toFrame(payload)),
    }).then(function (res) {
      return res.text().then(function (bodyText) {
        var frames = readFrames(b64ToBytes(bodyText));
        if (frames.status !== 0) {
          var err = new Error(frames.message || "request failed");
          err.grpcStatus = frames.status;
          throw err;
        }
        return frames.data;
      });
    });
  }

  function apiLogin(email, password) {
    var payload = LoginRequest.encode(
      LoginRequest.fromObject({ email: email, password: password })
    ).finish();
    return grpcCall("auth.AuthService/Login", payload, null).then(function (frames) {
      return LoginResponse.decode(frames[0]);
    });
  }

  function apiWhoAmI(token) {
    var payload = EmptyMessage.encode(EmptyMessage.fromObject({})).finish();
    return grpcCall("auth.AuthService/WhoAmI", payload, token).then(function (frames) {
      return UserInfo.decode(frames[0]);
    });
  }

  function apiListVehicles(token) {
    var payload = ListVehiclesRequest.encode(
      ListVehiclesRequest.fromObject({ zone: "", pageSize: 50 })
    ).finish();
    return grpcCall("fleet.FleetService/ListVehicles", payload, token).then(function (frames) {
      return ListVehiclesResponse.decode(frames[0]);
    });
  }

  var els = {
    loginView: document.getElementById("view-login"),
    fleetView: document.getElementById("view-fleet"),
    form: document.getElementById("login-form"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    loginBtn: document.getElementById("login-btn"),
    loginError: document.getElementById("login-error"),
    session: document.getElementById("session"),
    sessionUser: document.getElementById("session-user"),
    sessionRole: document.getElementById("session-role"),
    logoutBtn: document.getElementById("logout-btn"),
    rows: document.getElementById("fleet-rows"),
    updatedAt: document.getElementById("updated-at"),
  };

  var state = { token: null, timer: null };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showLogin() {
    state.token = null;
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      // storage unavailable; session simply will not persist
    }
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
    els.session.classList.remove("visible");
    els.fleetView.classList.add("hidden");
    els.loginView.classList.remove("hidden");
  }

  function showFleet(user) {
    els.sessionUser.textContent = user.displayName + " · " + user.email;
    els.sessionRole.textContent = user.role;
    els.session.classList.add("visible");
    els.loginView.classList.add("hidden");
    els.fleetView.classList.remove("hidden");
    refreshVehicles();
    if (state.timer) window.clearInterval(state.timer);
    state.timer = window.setInterval(refreshVehicles, REFRESH_MS);
  }

  function refreshVehicles() {
    if (!state.token) return;
    apiListVehicles(state.token).then(function (resp) {
      var html = "";
      var vehicles = resp.vehicles || [];
      for (var i = 0; i < vehicles.length; i++) {
        var v = vehicles[i];
        html +=
          "<tr><td class=\"mono\">" + escapeHtml(v.id) + "</td>" +
          "<td>" + escapeHtml(v.name) + "</td>" +
          "<td><span class=\"pill " + escapeHtml(v.status) + "\">" + escapeHtml(v.status) + "</span></td>" +
          "<td>" + escapeHtml(v.zone) + "</td>" +
          "<td>" + escapeHtml(v.driverName) + "</td></tr>";
      }
      els.rows.innerHTML = html;
      els.updatedAt.textContent =
        "Updated " + new Date().toLocaleTimeString() + " · " + vehicles.length + " units";
    }).catch(function (err) {
      if (err && err.grpcStatus === 16) {
        showLogin();
      }
    });
  }

  function resume(token) {
    state.token = token;
    apiWhoAmI(token).then(
      function (user) {
        showFleet(user);
      },
      function () {
        showLogin();
      }
    );
  }

  els.form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    els.loginError.classList.remove("visible");
    els.loginBtn.disabled = true;
    els.loginBtn.textContent = "Signing in…";
    apiLogin(els.email.value.trim(), els.password.value).then(
      function (resp) {
        els.loginBtn.disabled = false;
        els.loginBtn.textContent = "Sign in";
        try {
          window.localStorage.setItem(SESSION_KEY, resp.token);
        } catch (e) {
          // storage unavailable; session simply will not persist
        }
        resume(resp.token);
      },
      function (err) {
        els.loginBtn.disabled = false;
        els.loginBtn.textContent = "Sign in";
        els.loginError.textContent =
          err && err.grpcStatus === 16
            ? "Invalid email or password."
            : "Sign-in failed. Please try again.";
        els.loginError.classList.add("visible");
      }
    );
  });

  els.logoutBtn.addEventListener("click", showLogin);

  var stored = null;
  try {
    stored = window.localStorage.getItem(SESSION_KEY);
  } catch (e) {
    stored = null;
  }
  if (stored) {
    resume(stored);
  }
})();
