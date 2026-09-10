const grpc = require("@grpc/grpc-js");
const { BACKEND_ADDR } = require("./bridge");

const channel = new grpc.Client(BACKEND_ADDR, grpc.credentials.createInsecure());

function healthCheck() {
  return new Promise((resolve, reject) => {
    const call = channel.makeBidiStreamRequest(
      "/grpc.health.v1.Health/Check",
      (value) => Buffer.from(value),
      (value) => Buffer.from(value),
      new grpc.Metadata(),
      { deadline: Date.now() + 3000 }
    );
    let settled = false;
    const request = Buffer.from([0x0a, 0x00]);
    call.on("data", (chunk) => {
      if (settled) return;
      settled = true;
      try {
        call.cancel();
      } catch (err) {
        // stream already closed
      }
      const serving = chunk.length === 2 && chunk[0] === 0x08 && chunk[1] === 0x01;
      resolve(serving ? "SERVING" : "UNKNOWN");
    });
    call.on("error", () => {
      // terminal state is delivered through "status"; nothing to do here
    });
    call.on("status", (status) => {
      if (!settled) {
        settled = true;
        reject(new Error(`health check failed: ${status.code}`));
      }
    });
    call.write(request);
    call.end();
    setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          call.cancel();
        } catch (err) {
          // stream already closed
        }
        reject(new Error("health check timed out"));
      }
    }, 3000);
  });
}

module.exports = { healthCheck };
