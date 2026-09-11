"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { getDb } = require("../db");

// Fixed deterministic identifiers so a reseeded environment is identical.
const UUIDS = {
  accountPrimary: "e555b52c-2c55-4f68-a219-2c2ae9dc9c2b",
  accountPartner: "b91f14f6-3a24-4d25-9f1c-8d7a6a2f0e15",
  userDaffy: "9b7f8a2c-0c7f-4bfa-9d14-ea5ee07d5b3c",
  userAdmin: "4f22a649-92c2-4d64-9d55-9ce8a8ba6b02",
  userPartner: "6e8f2d48-c69b-4a0f-b8b6-a0f4b32c17d9",
};

const DAFFY_PASSWORD = "DuckSeason2024!";

const PRODUCT_SEED = [
  ["SKU-1001", "Classic Rubber Duck", "The timeless yellow companion for any desk or bathtub.", 499, 1240],
  ["SKU-1002", "Giant Rubber Duck (60cm)", "An oversized floating statement piece for pools and ponds.", 2999, 210],
  ["SKU-1003", "DevOps Duck (Hard Hat)", "Ships features on Friday. Rubber, resilient, unbothered.", 1299, 340],
  ["SKU-1004", "Night-Duck LED", "Glows softly in seven colors. Perfect for late-night incident review.", 1899, 500],
  ["SKU-1005", "Squeakless Silent Duck", "For shared offices. All the duck, none of the squeak.", 899, 780],
  ["SKU-1006", "Duck Debugger Kit (5-pack)", "Five ducks, five mysterious bugs, endless patience required.", 3499, 150],
  ["SKU-1007", "Bath Bombs, Duck Scent", "A fizzy bath companion set with a subtle rubber-duck aroma.", 1499, 0],
  ["SKU-1008", "Quantum Duck (Schrödinger Edition)", " simultaneously shipped and not shipped until observed.", 4999, 42],
  ["SKU-1009", "Duckurity Sticker Pack", "Waterproof vinyl stickers for laptops, servers, and ducks.", 599, 2000],
  ["SKU-1010", "Mallard Executive Plush", "Premium plush mallard with business-casual necktie.", 2499, 95],
];

function seed() {
  const db = getDb();
  const now = "2026-01-05T09:00:00.000Z";

  const seeded = db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE email = ?")
    .get("daffy@duckurity.example");
  if (seeded.n > 0) {
    return;
  }

  const insertAccount = db.prepare(
    "INSERT INTO accounts (id, name, createdAt) VALUES (?, ?, ?)"
  );
  const insertUser = db.prepare(
    `INSERT INTO users (id, accountId, email, passwordHash, firstName, lastName, locale, role, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertProduct = db.prepare(
    `INSERT INTO products (sku, title, description, priceCents, currency, stock, createdAt)
     VALUES (?, ?, ?, ?, 'USD', ?, ?)`
  );

  const run = db.transaction(() => {
    insertAccount.run(UUIDS.accountPrimary, "Duckurity Demo Account", now);
    insertAccount.run(UUIDS.accountPartner, "Acme Pilot Partner", now);

    insertUser.run(
      UUIDS.userDaffy,
      UUIDS.accountPrimary,
      "daffy@duckurity.example",
      bcrypt.hashSync(DAFFY_PASSWORD, 10),
      "Daffy",
      "Dumas",
      "en-US",
      "ROLE_USER",
      now,
      now
    );

    // Partner evaluation account for the Functions pilot program. Credentials
    // rotate via the partner program; test harnesses may pin them with
    // SEED_PARTNER_PASSWORD.
    const partnerPassword = process.env.SEED_PARTNER_PASSWORD;
    insertUser.run(
      UUIDS.userPartner,
      UUIDS.accountPartner,
      "pilot@acme.example",
      bcrypt.hashSync(
        partnerPassword && partnerPassword.length >= 8
          ? partnerPassword
          : crypto.randomBytes(24).toString("base64url"),
        10
      ),
      "Perry",
      "Partner",
      "en-US",
      "ROLE_USER",
      now,
      now
    );

    // Operations account. Password is managed by the platform team; when no
    // SEED_ADMIN_PASSWORD is provided at boot, a strong random one is generated
    // and never exposed through any API surface.
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword) {
      insertUser.run(
        UUIDS.userAdmin,
        UUIDS.accountPrimary,
        "ops@duckurity.example",
        bcrypt.hashSync(crypto.randomBytes(24).toString("base64url"), 10),
        "Opal",
        "Oversight",
        "en-US",
        "ROLE_ADMIN",
        now,
        now
      );
    } else {
      insertUser.run(
        UUIDS.userAdmin,
        UUIDS.accountPrimary,
        "ops@duckurity.example",
        bcrypt.hashSync(adminPassword, 10),
        "Opal",
        "Oversight",
        "en-US",
        "ROLE_ADMIN",
        now,
        now
      );
    }

    for (const [sku, title, description, priceCents, stock] of PRODUCT_SEED) {
      insertProduct.run(sku, title, description, priceCents, stock, now);
    }
  });

  run();
}

module.exports = { seed, UUIDS, DAFFY_PASSWORD };
