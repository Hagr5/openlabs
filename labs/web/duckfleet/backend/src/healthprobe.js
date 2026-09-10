const grpc = require("@grpc/grpc-js");
const { packages } = require("./proto");

const TARGET = process.env.GRPC_TARGET || "127.0.0.1:50051";

const client = new packages.grpc.health.v1.Health(
  TARGET,
  grpc.credentials.createInsecure()
);

client.check({ service: "" }, { deadline: Date.now() + 3000 }, (err, response) => {
  if (err || !response || (response.status !== 1 && response.status !== "SERVING")) {
    process.exit(1);
  }
  process.exit(0);
});
