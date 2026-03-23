import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import mongoose from "mongoose";
import request from "supertest";
import { io as createClient, type Socket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach } from "vitest";
import type * as MatchModule from "../src/models/Match.js";
import type * as MessageModule from "../src/models/Message.js";
import type * as UserModule from "../src/models/User.js";
import type * as AppModule from "../src/app.js";
import type * as DbModule from "../src/db.js";
import type * as SocketModule from "../src/socket/index.js";
import type * as ServiceModule from "../src/services/liveMatchService.js";

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-session-secret";
delete process.env.MONGO_URI;

export type ServerRuntime = {
  MatchModel: typeof MatchModule.MatchModel;
  MessageModel: typeof MessageModule.MessageModel;
  UserModel: typeof UserModule.UserModel;
  canUseTransactions: typeof DbModule.canUseTransactions;
  createApp: typeof AppModule.createApp;
  disconnectFromDatabase: typeof DbModule.disconnectFromDatabase;
  initializeSocket: typeof SocketModule.initializeSocket;
  LiveMatchService: typeof ServiceModule.LiveMatchService;
  LIVE_MATCH_ERRORS: typeof ServiceModule.LIVE_MATCH_ERRORS;
};

export type SocketRuntimeServer = {
  app: Awaited<ReturnType<ServerRuntime["createApp"]>>["app"];
  httpServer: ReturnType<typeof createServer>;
  io: ReturnType<ServerRuntime["initializeSocket"]>;
  liveMatchService: InstanceType<ServerRuntime["LiveMatchService"]>;
  serverUrl: string;
};

async function loadRuntime() {
  const [
    { MatchModel },
    { MessageModel },
    { UserModel },
    appModule,
    dbModule,
    socketModule,
    serviceModule
  ] = await Promise.all([
    import("../src/models/Match.js"),
    import("../src/models/Message.js"),
    import("../src/models/User.js"),
    import("../src/app.js"),
    import("../src/db.js"),
    import("../src/socket/index.js"),
    import("../src/services/liveMatchService.js")
  ]);

  return {
    MatchModel,
    MessageModel,
    UserModel,
    canUseTransactions: dbModule.canUseTransactions,
    createApp: appModule.createApp,
    disconnectFromDatabase: dbModule.disconnectFromDatabase,
    initializeSocket: socketModule.initializeSocket,
    LiveMatchService: serviceModule.LiveMatchService,
    LIVE_MATCH_ERRORS: serviceModule.LIVE_MATCH_ERRORS
  } satisfies ServerRuntime;
}

export function setupServerTestRuntime() {
  let runtime: ServerRuntime;

  beforeAll(async () => {
    runtime = await loadRuntime();
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState !== 0 && mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
    }
  });

  afterAll(async () => {
    await runtime.disconnectFromDatabase();
  });

  return {
    getRuntime() {
      return runtime;
    }
  };
}

export function waitForEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 10_000
) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handleEvent);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);

    const handleEvent = (payload: T) => {
      clearTimeout(timeout);
      socket.off(event, handleEvent);
      resolve(payload);
    };

    socket.on(event, handleEvent);
  });
}

export function emitWithAck<T>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 10_000
) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack from "${event}"`));
    }, timeoutMs);

    socket.emit(event, payload, (result: T) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

export async function createAuthenticatedSocket(
  serverUrl: string,
  httpServer: Parameters<typeof request.agent>[0],
  displayName: string
) {
  const agent = request.agent(httpServer);
  const loginResponse = await agent
    .post("/api/auth/guest")
    .send({ displayName });
  const cookies = loginResponse.headers["set-cookie"];
  const cookiesHeader = cookies
    ? cookies.map((cookie: string) => cookie.split(";")[0]).join("; ")
    : undefined;

  const socket = createClient(serverUrl, {
    extraHeaders: cookiesHeader
      ? {
          Cookie: cookiesHeader
        }
      : undefined,
    forceNew: true,
    transports: ["websocket"]
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Socket connection timed out")),
      10_000
    );

    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });

    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 50));

  return {
    agent,
    cookiesHeader,
    socket,
    user: loginResponse.body.user as { userId: string; displayName: string }
  };
}

export async function connectSocketWithCookies(
  serverUrl: string,
  cookiesHeader: string | undefined
) {
  const socket = createClient(serverUrl, {
    extraHeaders: cookiesHeader
      ? {
          Cookie: cookiesHeader
        }
      : undefined,
    forceNew: true,
    transports: ["websocket"]
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Socket connection timed out")),
      10_000
    );

    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });

    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 50));

  return socket;
}

export async function startSocketRuntime(
  runtime: ServerRuntime
): Promise<SocketRuntimeServer> {
  const liveMatchService = new runtime.LiveMatchService();
  const { app, sessionMiddleware } = await runtime.createApp(liveMatchService);
  const httpServer = createServer(app);

  const io = runtime.initializeSocket(
    httpServer,
    app,
    sessionMiddleware,
    liveMatchService
  );

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const address = httpServer.address() as AddressInfo;

  return {
    app,
    httpServer,
    io,
    liveMatchService,
    serverUrl: `http://127.0.0.1:${address.port}`
  };
}

export async function stopSocketRuntime(runtimeServer: SocketRuntimeServer) {
  runtimeServer.io.close();
  await new Promise<void>((resolve, reject) => {
    runtimeServer.httpServer.close((error) =>
      error ? reject(error) : resolve()
    );
  });
  runtimeServer.liveMatchService.dispose();
}

export async function startRankedMatchRuntime(
  runtime: ServerRuntime,
  playerOneName = "RankedOne",
  playerTwoName = "RankedTwo"
) {
  const runtimeServer = await startSocketRuntime(runtime);
  const playerOne = await createAuthenticatedSocket(
    runtimeServer.serverUrl,
    runtimeServer.httpServer,
    playerOneName
  );
  const playerTwo = await createAuthenticatedSocket(
    runtimeServer.serverUrl,
    runtimeServer.httpServer,
    playerTwoName
  );

  const playerOneStartPromise = waitForEvent<{ matchId: string }>(
    playerOne.socket,
    "match:start"
  );
  const playerTwoStartPromise = waitForEvent<{ matchId: string }>(
    playerTwo.socket,
    "match:start"
  );

  const firstQueueJoin = await emitWithAck<{ ok: boolean }>(
    playerOne.socket,
    "queue:join",
    { mode: "ranked" }
  );
  const secondQueueJoin = await emitWithAck<{ ok: boolean }>(
    playerTwo.socket,
    "queue:join",
    { mode: "ranked" }
  );

  if (!firstQueueJoin.ok || !secondQueueJoin.ok) {
    throw new Error("Expected both ranked queue joins to succeed.");
  }

  const matchOne = await playerOneStartPromise;
  const matchTwo = await playerTwoStartPromise;

  if (matchOne.matchId !== matchTwo.matchId) {
    throw new Error("Expected both sockets to receive the same ranked match.");
  }

  return {
    matchId: matchOne.matchId,
    playerOne,
    playerTwo,
    runtimeServer
  };
}
