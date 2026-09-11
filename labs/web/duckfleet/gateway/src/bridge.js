const grpc = require("@grpc/grpc-js");
const {
  encodeData,
  encodeTrailer,
  parseFrames,
  createBase64Stream,
} = require("./frames");

const BACKEND_ADDR = process.env.BACKEND_ADDR || "backend:50051";
const MAX_BODY_BYTES = 1024 * 1024;

const BINARY_TYPE = "application/grpc-web+proto";
const TEXT_TYPE = "application/grpc-web-text+proto";

const SKIP_HEADERS = new Set([
  "connection",
  "content-length",
  "content-type",
  "transfer-encoding",
  "trailer",
  "te",
  "upgrade",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "accept",
  "accept-charset",
  "accept-encoding",
  "accept-language",
  "user-agent",
  "referer",
  "origin",
  "cookie",
  "set-cookie",
  "cache-control",
  "pragma",
  "dnt",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-ch-ua-full-version-list",
  "sec-ch-ua-arch",
  "sec-ch-ua-bitness",
  "if-modified-since",
  "if-none-match",
  "if-match",
  "if-range",
  "if-unmodified-since",
  "range",
  "grpc-timeout",
  "grpc-encoding",
  "grpc-accept-encoding",
  "grpc-message-type",
  "grpc-status",
  "grpc-message",
]);

const METADATA_KEY = /^[0-9a-z_.\-]+$/;

const channel = new grpc.Client(BACKEND_ADDR, grpc.credentials.createInsecure(), {
  "grpc.max_receive_message_length": 1024 * 1024,
  "grpc.max_send_message_length": 1024 * 1024,
});

function buildMetadata(headers) {
  const metadata = new grpc.Metadata();
  for (const [name, value] of Object.entries(headers || {})) {
    const key = String(name).toLowerCase();
    if (SKIP_HEADERS.has(key)) continue;
    if (key.endsWith("-bin")) continue;
    if (!METADATA_KEY.test(key)) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === undefined || v === null) continue;
      try {
        metadata.add(key, String(v));
      } catch (err) {
        // not a valid metadata value for the backend; drop it
      }
    }
  }
  return metadata;
}

const HTTP_HEADER_NAME = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

function applyInitialMetadata(res, metadata) {
  if (!metadata || res.headersSent) return;
  const map = metadata.getMap();
  for (const [key, value] of Object.entries(map)) {
    if (!HTTP_HEADER_NAME.test(key)) continue;
    const lower = key.toLowerCase();
    if (lower === "content-type" || lower === "content-length" || lower === "transfer-encoding") {
      continue;
    }
    try {
      res.setHeader(key, typeof value === "string" ? value : Buffer.from(value).toString("base64"));
    } catch (err) {
      // response already on its way; ignore
    }
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject({ httpStatus: 413, message: "REQUEST_TOO_LARGE" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => reject({ httpStatus: 400, message: "REQUEST_READ_FAILED" }));
  });
}

function methodFromPath(service, method) {
  const path = `${service}/${method}`;
  if (!/^[A-Za-z0-9_.]+\/[A-Za-z0-9_]+$/.test(path)) {
    return null;
  }
  return `/${path}`;
}

function bridgeRequest(req, res) {
  const started = Date.now();
  const finish = (grpcStatus) => {
    const elapsed = Date.now() - started;
    process.stdout.write(
      `${new Date().toISOString()} ${req.method} ${req.path} -> ${res.statusCode} (grpc ${grpcStatus}) ${elapsed}ms\n`
    );
  };

  if (req.method !== "POST") {
    res.status(405).type("text/plain").send("METHOD_NOT_ALLOWED");
    finish("-");
    return;
  }

  const rawContentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  const textMode = rawContentType === TEXT_TYPE;
  if (rawContentType !== BINARY_TYPE && !textMode) {
    res.status(415).type("text/plain").send("UNSUPPORTED_MEDIA_TYPE");
    finish("-");
    return;
  }

  const methodPath = methodFromPath(req.params.service, req.params.method);
  if (!methodPath) {
    res.status(404).type("text/plain").send("NOT_FOUND");
    finish("-");
    return;
  }

  res.status(200);
  res.setHeader("content-type", textMode ? TEXT_TYPE : BINARY_TYPE);
  res.setHeader("cache-control", "no-store");

  const encoder = textMode ? createBase64Stream() : null;
  let settled = false;
  let grpcStatus = null;

  const sendRaw = (bytes) => {
    if (settled) return;
    try {
      res.write(textMode ? encoder.push(bytes) : bytes);
    } catch (err) {
      settled = true;
      try {
        res.end();
      } catch (ignored) {
        // client already gone
      }
    }
  };

  const endWithTrailer = (code, details) => {
    if (settled) return;
    settled = true;
    grpcStatus = code;
    const trailer = encodeTrailer(code, details);
    try {
      if (textMode) {
        res.write(encoder.push(trailer) + encoder.flush());
      } else {
        res.write(trailer);
      }
    } catch (err) {
      // client already gone
    }
    try {
      res.end();
    } catch (err) {
      // client already gone
    }
    finish(code);
  };

  readBody(req).then(
    (raw) => {
      let wire = raw;
      if (textMode) {
        try {
          wire = Buffer.from(raw.toString("ascii").replace(/\s+/g, ""), "base64");
        } catch (err) {
          res.status(400).type("text/plain").send("INVALID_BODY_ENCODING");
          settled = true;
          finish("-");
          return;
        }
      }
      let messages;
      try {
        messages = parseFrames(wire).messages;
      } catch (err) {
        res.status(err.httpStatus || 400).type("text/plain").send(err.message || "MALFORMED_FRAME");
        settled = true;
        finish("-");
        return;
      }

      const metadata = buildMetadata(req.headers);
      let call;
      try {
        call = channel.makeBidiStreamRequest(
          methodPath,
          (value) => Buffer.from(value),
          (value) => Buffer.from(value),
          metadata,
          {}
        );
      } catch (err) {
        endWithTrailer(14, "BACKEND_UNAVAILABLE");
        return;
      }

      call.on("metadata", (initial) => {
        applyInitialMetadata(res, initial);
      });
      call.on("data", (chunk) => {
        sendRaw(encodeData(chunk));
      });
      call.on("error", (callError) => {
        const code =
          callError && Number.isInteger(callError.code) ? callError.code : 14;
        const details =
          (callError && (callError.details || callError.message)) || "BACKEND_ERROR";
        endWithTrailer(code, details);
      });
      call.on("status", (status) => {
        const code = status.code || 0;
        endWithTrailer(code, code === 0 ? "" : status.details || "");
      });

      const cancel = () => {
        if (!settled) {
          try {
            call.cancel();
          } catch (err) {
            // already gone
          }
        }
      };
      req.on("close", cancel);
      res.on("close", cancel);

      try {
        for (const message of messages) {
          call.write(message);
        }
        call.end();
      } catch (err) {
        endWithTrailer(14, "BACKEND_UNAVAILABLE");
      }
    },
    (err) => {
      res.status(err.httpStatus || 400).type("text/plain").send(err.message || "BAD_REQUEST");
      settled = true;
      finish("-");
    }
  );
}

module.exports = { bridgeRequest, BACKEND_ADDR };
