"use strict";

const express = require("express");
const repo = require("../db/repositories");

const router = express.Router();

router.get("/catalog/products", (req, res) => {
  const products = repo.products.list().map((p) => ({
    id: p.id,
    sku: p.sku,
    title: p.title,
    description: p.description,
    price: { amountCents: p.priceCents, currency: p.currency },
    inStock: p.stock > 0,
  }));
  res.json({ products });
});

module.exports = router;
