import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.SMOKE_PORT ?? 3101);
const origin = `http://127.0.0.1:${port}`;
const mongoUri =
  process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/ping-pong-arena";

async function waitForHealthy(url, timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {
      // Keep polling until the timeout expires.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

const server = spawn(process.execPath, ["apps/server/dist/index.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    CLIENT_URL: origin,
    SESSION_SECRET:
      process.env.SESSION_SECRET ?? "production-smoke-session-secret",
    MONGO_URI: mongoUri
  },
  stdio: ["ignore", "pipe", "pipe"]
});

server.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
});
server.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

try {
  await waitForHealthy(`${origin}/api/healthz`);

  const rootResponse = await fetch(origin);
  if (!rootResponse.ok) {
    throw new Error(`Root request failed with status ${rootResponse.status}.`);
  }

  const html = await rootResponse.text();
  if (!html.includes("<title>Ping Pong Arena</title>")) {
    throw new Error("Smoke check failed: expected Ping Pong Arena HTML shell.");
  }

  console.log(`Production smoke passed on ${origin}.`);
} catch (error) {
  const help = `Production smoke failed. Ensure the project is built and MongoDB is reachable at ${mongoUri}.`;
  console.error(help);
  throw error;
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    delay(5_000).then(() => server.kill("SIGKILL"))
  ]);
}
