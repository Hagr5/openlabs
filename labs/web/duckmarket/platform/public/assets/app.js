// DuckMarket storefront bundle (v1.4.2).
// Handles session UI, catalog rendering and profile management.
(function () {
  "use strict";

  // Service endpoints. The integrations preview endpoint is reserved for the
  // upcoming API-integrations console and is not exposed in the storefront UI.
  var API_CONFIG = {
    catalog: "/api/catalog/products",
    health: "/api/healthz",
    profile: "/api/account/v2/users",
    auth: {
      login: "/api/auth/login",
      logout: "/api/auth/logout"
    },
    integrations: {
      // Preview GraphQL surface used by the integrations console currently in
      // internal testing. Not linked from the storefront yet.
      previewEndpoint: "/api/graphql/preview"
    }
  };

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function apiFetch(url, options) {
    options = options || {};
    options.credentials = "same-origin";
    options.headers = Object.assign(
      { "content-type": "application/json" },
      options.headers || {}
    );
    var csrf = getCookie("XSRF-TOKEN");
    if (csrf && options.method && options.method !== "GET") {
      options.headers["X-XSRF-TOKEN"] = csrf;
    }
    return fetch(url, options).then(function (res) {
      if (res.status === 204) return { ok: true, status: 204 };
      return res.json().then(
        function (body) { return { ok: res.ok, status: res.status, body: body }; },
        function () { return { ok: res.ok, status: res.status, body: null }; }
      );
    });
  }

  // ----- Catalog -----------------------------------------------------------

  function renderCatalog() {
    var grid = document.getElementById("products");
    apiFetch(API_CONFIG.catalog).then(function (res) {
      if (!res.ok || !res.body || !res.body.products) {
        grid.innerHTML = '<p class="muted">Catalog is temporarily unavailable.</p>';
        return;
      }
      grid.innerHTML = "";
      res.body.products.forEach(function (p) {
        var card = document.createElement("div");
        card.className = "product-card";
        var price = (p.price.amountCents / 100).toFixed(2);
        card.innerHTML =
          '<span class="product-sku"></span>' +
          '<span class="product-title"></span>' +
          '<span class="product-desc"></span>' +
          '<div class="product-meta"><span class="product-price"></span>' +
          '<span class="' + (p.inStock ? "badge-in" : "badge-out") + '"></span></div>';
        card.querySelector(".product-sku").textContent = p.sku;
        card.querySelector(".product-title").textContent = p.title;
        card.querySelector(".product-desc").textContent = p.description;
        card.querySelector(".product-price").textContent = p.price.currency + " " + price;
        card.querySelector(p.inStock ? ".badge-in" : ".badge-out").textContent = p.inStock
          ? "In stock"
          : "Out of stock";
        grid.appendChild(card);
      });
    });
  }

  // ----- Session UI --------------------------------------------------------

  var currentUser = null;

  function showAccount() {
    document.getElementById("login-btn").classList.add("hidden");
    document.getElementById("session-slot").innerHTML =
      '<span class="muted" id="session-email-slot"></span> <button id="logout-btn-2" class="btn btn-ghost">Sign out</button>';
    document.getElementById("session-email-slot").textContent = currentUser.email;
    document.getElementById("logout-btn-2").addEventListener("click", doLogout);

    document.getElementById("account").classList.remove("hidden");
    document.getElementById("pf-first").value = currentUser.firstName;
    document.getElementById("pf-last").value = currentUser.lastName;
    document.getElementById("pf-locale").value = currentUser.locale;
    document.getElementById("session-email").textContent = currentUser.email;
  }

  function hideAccount() {
    document.getElementById("account").classList.add("hidden");
    var slot = document.getElementById("session-slot");
    slot.innerHTML = '<button id="login-btn" class="btn btn-ghost">Sign in</button>';
    slot.querySelector("#login-btn").addEventListener("click", openLoginModal);
    currentUser = null;
  }

  function openLoginModal() {
    document.getElementById("login-modal").classList.remove("hidden");
    document.getElementById("login-error").classList.add("hidden");
    setTimeout(function () {
      document.getElementById("login-email").focus();
    }, 50);
  }

  function closeLoginModal() {
    document.getElementById("login-modal").classList.add("hidden");
    document.getElementById("login-form").reset();
  }

  function doLogin(event) {
    event.preventDefault();
    var email = document.getElementById("login-email").value;
    var password = document.getElementById("login-password").value;
    apiFetch(API_CONFIG.auth.login, {
      method: "POST",
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) {
      if (res.ok && res.body && res.body.user) {
        currentUser = res.body.user;
        closeLoginModal();
        showAccount();
      } else {
        var el = document.getElementById("login-error");
        el.textContent =
          (res.body && res.body.message) || "Sign-in failed. Please try again.";
        el.classList.remove("hidden");
      }
    });
  }

  function doLogout() {
    apiFetch(API_CONFIG.auth.logout, { method: "POST" }).then(function () {
      hideAccount();
    });
  }

  function saveProfile(event) {
    event.preventDefault();
    var payload = {
      firstName: document.getElementById("pf-first").value,
      lastName: document.getElementById("pf-last").value,
      locale: document.getElementById("pf-locale").value
    };
    apiFetch(API_CONFIG.profile + "/" + currentUser.id, {
      method: "PUT",
      body: JSON.stringify(payload)
    }).then(function (res) {
      var note = document.getElementById("profile-saved");
      if (res.ok && res.body && res.body.user) {
        currentUser = res.body.user;
        note.textContent = "Profile saved.";
      } else {
        note.textContent =
          (res.body && res.body.message) || "Could not save profile.";
      }
      setTimeout(function () {
        note.textContent = "";
      }, 2500);
    });
  }

  // ----- Init --------------------------------------------------------------

  function init() {
    document.getElementById("login-btn").addEventListener("click", openLoginModal);
    document.getElementById("login-cancel").addEventListener("click", closeLoginModal);
    document.getElementById("login-form").addEventListener("submit", doLogin);
    document.getElementById("profile-form").addEventListener("submit", saveProfile);
    document.getElementById("logout-btn").addEventListener("click", doLogout);
    renderCatalog();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
