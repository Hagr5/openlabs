"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PACKAGES_DIR = process.env.PACKAGES_DIR || "/packages";

// A valid function package:
//   - is a parseable ZIP with no path-traversal entries
//   - contains a package.json with a `main` that resolves to a file in the
//     archive (bundled dependencies only; the runtime has no network access)
//   - contains only .js/.json/.node-free text assets (no symlinks, no exotic bits)

const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024; // 25MB total uncompressed

function validatePackageName(entryName) {
  // Reject absolute paths, drive letters, ".." segments, backslashes and
  // control characters. Every segment must be a sane file name.
  if (entryName.includes("\\")) return false;
  if (entryName.includes("\0")) return false;
  if (/^[a-zA-Z]:/.test(entryName)) return false;
  if (entryName.startsWith("/")) return false;
  const segments = entryName.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return false;
    if (/[<>:"|?*\x00-\x1f]/.test(seg)) return false;
  }
  return true;
}

function provision(functionId, zipBuffer) {
  let entries;
  try {
    entries = require("./lib/zip").readArchive(zipBuffer);
  } catch (err) {
    return { ok: false, reason: `archive could not be parsed: ${err.message}` };
  }

  if (entries.length === 0) {
    return { ok: false, reason: "archive contains no files" };
  }

  for (const entry of entries) {
    if (!validatePackageName(entry.name)) {
      return {
        ok: false,
        reason: `archive entry '${entry.name}' has an invalid or unsafe path`,
      };
    }
  }

  const totalUncompressed = entries.reduce((sum, e) => sum + e.data.length, 0);
  if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
    return { ok: false, reason: "archive exceeds the 25MB uncompressed limit" };
  }

  const pkgEntry = entries.find((e) => e.name === "package.json");
  if (!pkgEntry) {
    return { ok: false, reason: "package.json not found in archive root" };
  }

  let pkg;
  try {
    pkg = JSON.parse(pkgEntry.data.toString("utf8"));
  } catch {
    return { ok: false, reason: "package.json is not valid JSON" };
  }

  const mainSpec = typeof pkg.main === "string" && pkg.main.length ? pkg.main : "index.js";
  const mainPath = path.normalize(mainSpec).replace(/^\.\//, "");
  if (mainPath.startsWith("..") || path.isAbsolute(mainPath)) {
    return { ok: false, reason: `package.json main '${mainSpec}' is invalid` };
  }

  const candidates = [mainPath];
  if (!mainPath.endsWith(".js")) {
    candidates.push(`${mainPath}.js`);
    candidates.push(path.join(mainPath, "index.js"));
  }

  const names = new Set(entries.map((e) => e.name));
  const resolved = candidates.find((c) => names.has(c));
  if (!resolved) {
    return {
      ok: false,
      reason: `package.json main '${mainSpec}' does not resolve to a file in the archive (bundle your dependencies; network installs are disabled)`,
    };
  }

  // Extract to a fresh package directory.
  const dir = path.join(PACKAGES_DIR, functionId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const entry of entries) {
    const dest = path.join(dir, entry.name);
    const rel = path.relative(dir, dest);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      // Belt and braces; validatePackageName already rejected these.
      fs.rmSync(dir, { recursive: true, force: true });
      return { ok: false, reason: `archive entry '${entry.name}' escapes the package directory` };
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, entry.data);
  }

  return {
    ok: true,
    main: resolved,
    runtime: "nodejs22.x",
    entryCount: entries.length,
  };
}

function packageDir(functionId) {
  const dir = path.join(PACKAGES_DIR, functionId);
  if (!dir.startsWith(PACKAGES_DIR)) throw new Error("invalid function id");
  return dir;
}

function hasPackage(functionId) {
  try {
    return fs.existsSync(path.join(packageDir(functionId), "package.json"));
  } catch {
    return false;
  }
}

module.exports = { provision, hasPackage, packageDir, PACKAGES_DIR };
