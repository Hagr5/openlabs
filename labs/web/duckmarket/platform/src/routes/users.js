"use strict";

const express = require("express");
const auth = require("../lib/auth");
const repo = require("../db/repositories");
const events = require("../lib/events");

const router = express.Router();

const LOCALES = new Set([
  "en-US",
  "en-GB",
  "de-DE",
  "fr-FR",
  "es-ES",
  "nl-NL",
  "pt-BR",
  "ja-JP",
]);

function ownUserOrAdmin(req, res, user, uuid) {
  if (user.role === "ROLE_ADMIN" || user.id === uuid) return true;
  res.status(403).json({
    error: "FORBIDDEN",
    message: "You do not have permission to access this user profile.",
  });
  return false;
}

router.get("/account/v2/users/:uuid", (req, res) => {
  const { uuid } = req.params;
  const user = req.user;
  if (!ownUserOrAdmin(req, res, user, uuid)) return;

  const target = repo.users.findById(uuid);
  if (!target) {
    return res.status(404).json({ error: "NOT_FOUND", message: "User not found." });
  }
  res.json({ user: toPublicUser(target) });
});

router.put("/account/v2/users/:uuid", (req, res) => {
  const { uuid } = req.params;
  const user = req.user;
  if (!ownUserOrAdmin(req, res, user, uuid)) return;

  const target = repo.users.findById(uuid);
  if (!target) {
    return res.status(404).json({ error: "NOT_FOUND", message: "User not found." });
  }

  const body = req.body || {};
  const updates = {};
  if (body.firstName !== undefined) {
    if (
      typeof body.firstName !== "string" ||
      body.firstName.length < 1 ||
      body.firstName.length > 64
    ) {
      return res
        .status(400)
        .json({ error: "INVALID_INPUT", message: "firstName must be 1-64 characters." });
    }
    updates.firstName = body.firstName.trim();
  }
  if (body.lastName !== undefined) {
    if (
      typeof body.lastName !== "string" ||
      body.lastName.length < 1 ||
      body.lastName.length > 64
    ) {
      return res
        .status(400)
        .json({ error: "INVALID_INPUT", message: "lastName must be 1-64 characters." });
    }
    updates.lastName = body.lastName.trim();
  }
  if (body.locale !== undefined) {
    if (!LOCALES.has(body.locale)) {
      return res
        .status(400)
        .json({ error: "INVALID_INPUT", message: "Unsupported locale." });
    }
    updates.locale = body.locale;
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error: "INVALID_INPUT",
      message: "At least one of firstName, lastName, locale must be provided.",
    });
  }

  const updated = repo.users.updateProfile(uuid, updates);
  res.json({ user: toPublicUser(updated) });

  // Async profile-change notification for account integrations.
  events.emitUserChanged(updated, {
    actorId: user.id,
    changedFields: Object.keys(updates),
  });
});

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    locale: user.locale,
    role: user.role,
  };
}

module.exports = router;
