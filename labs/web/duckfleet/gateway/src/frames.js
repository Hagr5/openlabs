const DATA = 0x00;
const TRAILER = 0x80;

function encodeFrame(typeByte, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || []);
  const out = Buffer.allocUnsafe(5 + body.length);
  out[0] = typeByte;
  out.writeUInt32BE(body.length, 1);
  body.copy(out, 5);
  return out;
}

function encodeData(payload) {
  return encodeFrame(DATA, payload);
}

function parseFrames(buf) {
  const messages = [];
  const trailers = [];
  let offset = 0;
  while (offset < buf.length) {
    if (offset + 5 > buf.length) {
      throw { httpStatus: 400, message: "MALFORMED_FRAME" };
    }
    const typeByte = buf[offset];
    const length = buf.readUInt32BE(offset + 1);
    if (offset + 5 + length > buf.length) {
      throw { httpStatus: 400, message: "MALFORMED_FRAME" };
    }
    const payload = buf.subarray(offset + 5, offset + 5 + length);
    if (typeByte === DATA) {
      messages.push(Buffer.from(payload));
    } else if (typeByte === TRAILER) {
      trailers.push(Buffer.from(payload));
    } else {
      throw { httpStatus: 400, message: "UNSUPPORTED_FRAME" };
    }
    offset += 5 + length;
  }
  return { messages, trailers };
}

function percentEncodeMessage(text) {
  const input = text === undefined || text === null ? "" : String(text);
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      ch === "-" ||
      ch === "_" ||
      ch === "." ||
      ch === "~"
    ) {
      out += ch;
    } else {
      const bytes = Buffer.from(ch, "utf8");
      for (const b of bytes) {
        out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return out;
}

function percentDecodeMessage(text) {
  try {
    return decodeURIComponent(String(text || "").replace(/\+/g, "%20"));
  } catch (err) {
    return String(text || "");
  }
}

function encodeTrailer(code, details) {
  let text = `grpc-status: ${code}\r\n`;
  if (details !== undefined && details !== null && String(details).length > 0) {
    text += `grpc-message: ${percentEncodeMessage(details)}\r\n`;
  }
  return encodeFrame(TRAILER, Buffer.from(text, "utf8"));
}

function parseTrailer(buf) {
  const text = Buffer.from(buf).toString("utf8");
  const result = { status: null, message: "" };
  for (const line of text.split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "grpc-status") {
      result.status = Number.parseInt(value, 10);
    } else if (key === "grpc-message") {
      result.message = percentDecodeMessage(value);
    }
  }
  return result;
}

function createBase64Stream() {
  let staging = Buffer.alloc(0);
  return {
    push(chunk) {
      staging = Buffer.concat([staging, Buffer.from(chunk)]);
      const take = staging.length - (staging.length % 3);
      const out = staging.subarray(0, take).toString("base64");
      staging = staging.subarray(take);
      return out;
    },
    flush() {
      const out = staging.toString("base64");
      staging = Buffer.alloc(0);
      return out;
    },
  };
}

module.exports = {
  DATA,
  TRAILER,
  encodeFrame,
  encodeData,
  parseFrames,
  percentEncodeMessage,
  percentDecodeMessage,
  encodeTrailer,
  parseTrailer,
  createBase64Stream,
};
