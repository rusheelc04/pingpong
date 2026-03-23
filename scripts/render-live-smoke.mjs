import http from "node:http";
import https from "node:https";

import process from "node:process";
import { io as createClient } from "socket.io-client";

const appOrigin = process.env.APP_ORIGIN;

if (!appOrigin) {
  throw new Error(
    "APP_ORIGIN is required, for example https://ping-pong-arena.onrender.com"
  );
}

const origin = new URL(appOrigin);
const requestModule = origin.protocol === "https:" ? https : http;

function request({ method, path, body, cookie }) {
  return new Promise((resolve, reject) => {
    const payload =
      body === undefined ? undefined : Buffer.from(JSON.stringify(body));

    const req = requestModule.request(
      {
        protocol: origin.protocol,
        hostname: origin.hostname,
        port: origin.port || undefined,
        path,
        method,
        headers: {
          Origin: origin.origin,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(payload.length)
              }
            : {}),
          ...(cookie ? { Cookie: cookie } : {})
        }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function getCookie(headers) {
  const raw = headers["set-cookie"];
  if (Array.isArray(raw)) {
    return raw.map((value) => value.split(";")[0]).join("; ");
  }

  if (typeof raw === "string") {
    return raw.split(";")[0];
  }

  return null;
}

function emitWithAck(socket, event, payload, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack from "${event}".`));
    }, timeoutMs);

    socket.emit(event, payload, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

const displayName = `RenderSmoke${Date.now()}`;
const loginResponse = await request({
  method: "POST",
  path: "/api/auth/guest",
  body: { displayName }
});

if (loginResponse.statusCode !== 200) {
  throw new Error(
    `Guest auth failed with status ${loginResponse.statusCode}: ${loginResponse.body}`
  );
}

const cookie = getCookie(loginResponse.headers);
if (!cookie) {
  throw new Error("Guest auth did not return a session cookie.");
}

const meResponse = await request({
  method: "GET",
  path: "/api/me",
  cookie
});

if (meResponse.statusCode !== 200) {
  throw new Error(`/api/me failed with status ${meResponse.statusCode}.`);
}

const socket = createClient(origin.origin, {
  transports: ["websocket"],
  extraHeaders: {
    Cookie: cookie,
    Origin: origin.origin
  }
});

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error("Socket connection timed out."));
  }, 10_000);

  socket.once("connect", () => {
    clearTimeout(timeout);
    resolve();
  });

  socket.once("connect_error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
});

try {
  const joinResult = await emitWithAck(socket, "queue:join", {
    mode: "practice"
  });

  if (!joinResult?.ok || !joinResult?.status?.matchId) {
    throw new Error(`Live practice join failed: ${JSON.stringify(joinResult)}`);
  }

  const detailResponse = await request({
    method: "GET",
    path: `/api/matches/${joinResult.status.matchId}`,
    cookie
  });

  if (detailResponse.statusCode !== 200) {
    throw new Error(
      `Live match detail failed with status ${detailResponse.statusCode}: ${detailResponse.body}`
    );
  }

  const detail = JSON.parse(detailResponse.body);
  if (detail.liveState?.matchId !== joinResult.status.matchId) {
    throw new Error(
      "Live match detail did not return the expected live state."
    );
  }

  console.log(
    `Render live smoke passed on ${origin.origin} for match ${joinResult.status.matchId}.`
  );
} finally {
  socket.disconnect();
}
