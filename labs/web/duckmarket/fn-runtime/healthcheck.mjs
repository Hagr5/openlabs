// Container healthcheck for the managed function runtime.
const key = process.env.FUNCTION_RUNTIME_SHARED_KEY || "";
try {
  const res = await fetch("http://localhost:8081/v1/healthz", {
    headers: { "x-runtime-key": key },
  });
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}
