"use strict";

const express = require("express");
const config = require("../config");
const repo = require("../db/repositories");
const runtimeClient = require("../lib/runtime-client");
const logger = require("../lib/logger");

const router = express.Router();

// Stand-in for the S3 presigned-upload flow used by the Functions pilot.
// The staging token is issued when the function record is created; the ZIP is
// PUT here once. After a successful upload the package is handed to the
// managed runtime for validation and provisioning.
router.put("/file-management/staged/:token", express.raw({ type: () => true, limit: config.uploads.maxZipBytes }), async (req, res) => {
  const { token } = req.params;
  const fn = repo.functions.findByUploadToken(token);
  if (!fn) {
    return res.status(403).json({
      error: "INVALID_UPLOAD_TOKEN",
      message: "This upload link is invalid or has already been used.",
    });
  }

  const contentType = req.headers["content-type"] || "";
  if (!/application\/(zip|x-zip-compressed|octet-stream)/i.test(contentType)) {
    return res.status(415).json({
      error: "UNSUPPORTED_MEDIA_TYPE",
      message: "The package must be uploaded as a ZIP archive (application/zip).",
    });
  }

  const zipBytes = req.body;
  if (!Buffer.isBuffer(zipBytes) || zipBytes.length === 0) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Empty package body." });
  }
  if (zipBytes.length > config.uploads.maxZipBytes) {
    return res.status(413).json({
      error: "PAYLOAD_TOO_LARGE",
      message: `The package exceeds the ${Math.round(config.uploads.maxZipBytes / (1024 * 1024))}MB limit.`,
    });
  }
  if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "The body is not a ZIP archive." });
  }

  repo.functions.markUploadConsumed(token);

  // Provisioning happens asynchronously; status moves to PROVISIONING and
  // the runtime reports READY or FAILED.
  repo.functions.updateStatus(fn.id, { status: "PROVISIONING" });
  res.status(202).json({
    status: "PROVISIONING",
    message: "Package accepted. Provisioning has started.",
  });

  setTimeout(() => {
    provisionPackage(fn, zipBytes).catch((err) => {
      logger.error("provisioning failed", { functionId: fn.id, reason: err.message });
      repo.functions.updateStatus(fn.id, { status: "FAILED" });
    });
  }, config.runtime.provisioningDelayMs);
});

async function provisionPackage(fn, zipBytes) {
  const result = await runtimeClient.provisionFunction(
    fn.id,
    zipBytes.toString("base64"),
    fn.codeFileName
  );
  if (result.ok) {
    repo.functions.updateStatus(fn.id, {
      status: "READY",
      runtime: result.runtime,
      packageMain: result.main,
    });
  } else {
    repo.functions.updateStatus(fn.id, { status: "FAILED", runtime: null });
    logger.warn("package rejected by runtime", { functionId: fn.id, reason: result.reason });
  }
}

module.exports = router;
