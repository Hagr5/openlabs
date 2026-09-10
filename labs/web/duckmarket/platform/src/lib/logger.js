"use strict";

const logger = {
  info(message, meta = {}) {
    process.stdout.write(
      JSON.stringify({ level: "info", time: new Date().toISOString(), message, ...meta }) + "\n"
    );
  },
  warn(message, meta = {}) {
    process.stdout.write(
      JSON.stringify({ level: "warn", time: new Date().toISOString(), message, ...meta }) + "\n"
    );
  },
  error(message, meta = {}) {
    process.stderr.write(
      JSON.stringify({ level: "error", time: new Date().toISOString(), message, ...meta }) + "\n"
    );
  },
};

module.exports = logger;
