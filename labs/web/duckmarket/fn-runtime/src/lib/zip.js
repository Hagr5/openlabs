// Minimal dependency-free ZIP reader/writer.
//
// Reads the central directory of a ZIP archive and supports STORE and DEFLATE
// (via zlib.inflateRawSync). Directory entries end with "/" and are skipped.
// This is intentionally strict: archives with unsupported features are
// rejected by the provisioning validator.

"use strict";

const zlib = require("zlib");

const SIG_LOCAL = 0x04034b50;
const SIG_CDIR = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function findEocd(buf) {
  // The EOCD is at the end of the file, possibly followed by a comment.
  const minOffset = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      return { offset: i, size: 22 + buf.readUInt16LE(i + 20) };
    }
  }
  throw new Error("not a valid ZIP archive (end-of-central-directory not found)");
}

function readEntries(buf) {
  const eocd = findEocd(buf);
  const entryCount = buf.readUInt16LE(eocd.offset + 10);
  const cdOffset = buf.readUInt32LE(eocd.offset + 16);

  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CDIR) {
      throw new Error("corrupt central directory");
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function entryData(buf, entry) {
  const lo = entry.localOffset;
  if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== SIG_LOCAL) {
    throw new Error(`corrupt local header for ${entry.name}`);
  }
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const dataStart = lo + 30 + nameLen + extraLen;
  const compressed = buf.slice(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
}

function readArchive(buffer) {
  const entries = readEntries(buffer);
  return entries
    .filter((e) => !e.name.endsWith("/"))
    .map((e) => ({
      name: e.name,
      isDir: false,
      data: entryData(buffer, e),
    }));
}

module.exports = { readArchive };
