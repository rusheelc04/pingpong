// These tests cover the real HTTP and socket contracts so refactors do not quietly break the playable match flow.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import mongoose from "mongoose";
import request from "supertest";
import { io as createClient, type Socket } from "socket.io-client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test
} from "vitest";
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

type ServerRuntime = {
  MatchModel: typeof MatchModule.MatchModel;
  MessageModel: typeof MessageModule.MessageModel;
  UserModel: typeof UserModule.UserModel;
  createApp: typeof AppModule.createApp;
  disconnectFromDatabase: typeof DbModule.disconnectFromDatabase;
  initializeSocket: typeof SocketModule.initializeSocket;
  LiveMatchService: typeof ServiceModule.LiveMatchService;
};

let runtime: ServerRuntime;

beforeAll(async () => {
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

  runtime = {
    MatchModel,
    MessageModel,
    UserModel,
    createApp: appModule.createApp,
    disconnectFromDatabase: dbModule.disconnectFromDatabase,
    initializeSocket: socketModule.initializeSocket,
    LiveMatchService: serviceModule.LiveMatchService
  };
});

beforeEach(async () => {
  if (mongoose.connection.readyState !== 0 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
});

afterAll(async () => {
  await runtime.disconnectFromDatabase();
});

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 10_000) {
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

function emitWithAck<T>(
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

async function createAuthenticatedSocket(
  serverUrl: string,
  httpServer: Parameters<typeof request.agent>[0],
  displayName: string
) {
  const agent = request.agent(httpServer);
  const loginResponse = await agent
    .post("/api/auth/guest")
    .send({ displayName });
  const cookies = loginResponse.headers["set-cookie"];

  const socket = createClient(serverUrl, {
    extraHeaders: cookies
      ? {
          Cookie: cookies
            .map((cookie: string) => cookie.split(";")[0])
            .join("; ")
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

  return {
    agent,
    socket,
    user: loginResponse.body.user as { userId: string; displayName: string }
  };
}

describe("API integration", () => {
  test("guest login persists a session and exposes /api/me", async () => {
    const liveMatchService = new runtime.LiveMatchService();
    const { app } = await runtime.createApp(liveMatchService);
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/auth/guest")
      .send({ displayName: "ApiGuest" })
      .expect(200);
    expect(loginResponse.body.user.displayName).toBe("ApiGuest");

    const meResponse = await agent.get("/api/me").expect(200);
    expect(meResponse.body.user.displayName).toBe("ApiGuest");
    expect(meResponse.body.activeMatchId).toBeNull();

    liveMatchService.dispose();
  });

  test("rooms, match history, match detail, and replay endpoints use persisted Mongo data", async () => {
    const liveMatchService = new runtime.LiveMatchService();
    const { app } = await runtime.createApp(liveMatchService);
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/auth/guest")
      .send({ displayName: "HistoryGuest" })
      .expect(200);
    const user = loginResponse.body.user as {
      userId: string;
      displayName: string;
    };

    const roomResponse = await agent.post("/api/rooms").send({}).expect(201);
    expect(roomResponse.body.room.code).toMatch(/^[A-Z0-9]{6}$/);

    const match = await runtime.MatchModel.create({
      mode: "practice",
      ranked: false,
      status: "ended",
      roomCode: null,
      players: [
        {
          side: "left",
          userId: user.userId,
          displayName: user.displayName,
          ratingBefore: 1000,
          ratingAfter: 1000,
          avatarUrl: null,
          isBot: false
        },
        {
          side: "right",
          userId: "bot-1",
          displayName: "Arcade Bot",
          ratingBefore: 1200,
          ratingAfter: 1200,
          avatarUrl: null,
          isBot: true
        }
      ],
      score: { left: 11, right: 6 },
      winnerId: user.userId,
      winnerName: user.displayName,
      endedBy: "score",
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      endedAt: new Date("2026-01-01T00:05:00.000Z"),
      stats: {
        rallyCount: 12,
        longestRally: 6,
        paddleHits: 20,
        maxBallSpeed: 12.4,
        durationSeconds: 300
      },
      replayFrames: [
        {
          t: 0,
          ball: { x: 500, y: 300 },
          paddles: { left: 240, right: 240 },
          score: { left: 0, right: 0 }
        }
      ]
    });

    await runtime.MessageModel.create({
      matchId: match._id.toString(),
      senderId: user.userId,
      senderName: user.displayName,
      body: "gg",
      createdAt: new Date("2026-01-01T00:01:00.000Z")
    });

    const matchesResponse = await agent.get("/api/matches").expect(200);
    expect(matchesResponse.body.matches).toHaveLength(1);
    expect(matchesResponse.body.matches[0].id).toBe(match._id.toString());

    const detailResponse = await agent
      .get(`/api/matches/${match._id}`)
      .expect(200);
    expect(detailResponse.body.match.id).toBe(match._id.toString());
    expect(detailResponse.body.messages).toHaveLength(1);
    expect(detailResponse.body.messages[0].body).toBe("gg");

    const replayResponse = await agent
      .get(`/api/matches/${match._id}/replay`)
      .expect(200);
    expect(replayResponse.body.replay.matchId).toBe(match._id.toString());
    expect(replayResponse.body.replay.frames).toHaveLength(1);
    expect(replayResponse.body.replay.captureMs).toBe(33);

    liveMatchService.dispose();
  });

  test("match history excludes live rows that have not actually ended yet", async () => {
    const liveMatchService = new runtime.LiveMatchService();
    const { app } = await runtime.createApp(liveMatchService);
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/auth/guest")
      .send({ displayName: "LiveFilterGuest" })
      .expect(200);
    const user = loginResponse.body.user as {
      userId: string;
      displayName: string;
    };

    await runtime.MatchModel.create({
      mode: "practice",
      ranked: false,
      status: "live",
      roomCode: null,
      players: [
        {
          side: "left",
          userId: user.userId,
          displayName: user.displayName,
          ratingBefore: 1000,
          ratingAfter: 1000,
          avatarUrl: null,
          isBot: false
        },
        {
          side: "right",
          userId: "bot-live",
          displayName: "Arcade Bot",
          ratingBefore: 1200,
          ratingAfter: 1200,
          avatarUrl: null,
          isBot: true
        }
      ],
      replayFrames: []
    });

    const matchesResponse = await agent.get("/api/matches").expect(200);
    expect(matchesResponse.body.matches).toHaveLength(0);

    liveMatchService.dispose();
  });
});

describe("Socket integration", () => {
  test("guest-authenticated sockets can start a practice match and chat", async () => {
    const liveMatchService = new runtime.LiveMatchService();
    const { app, sessionMiddleware } =
      await runtime.createApp(liveMatchService);
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
    const serverUrl = `http://127.0.0.1:${address.port}`;
    const { socket } = await createAuthenticatedSocket(
      serverUrl,
      httpServer,
      "SocketGuest"
    );

    try {
      const joinResult = await emitWithAck<{
        ok: boolean;
        status?: { matchId: string; status: string };
      }>(socket, "queue:join", {
        mode: "practice"
      });

      expect(joinResult.ok).toBe(true);
      expect(joinResult.status?.matchId).toBeTruthy();
      expect(joinResult.status?.status).toBe("prestart");

      const chatAck = await emitWithAck<{
        ok: boolean;
        message?: { body: string };
      }>(socket, "chat:send", {
        matchId: joinResult.status?.matchId,
        body: "hello from socket test"
      });

      expect(chatAck.ok).toBe(true);
      expect(chatAck.message?.body).toBe("hello from socket test");
    } finally {
      socket.disconnect();
      io.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      liveMatchService.dispose();
    }
  });

  test("private rooms start matches and emit a reconnect window when a player disconnects", async () => {
    const liveMatchService = new runtime.LiveMatchService();
    const { app, sessionMiddleware } =
      await runtime.createApp(liveMatchService);
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
    const serverUrl = `http://127.0.0.1:${address.port}`;
    const owner = await createAuthenticatedSocket(
      serverUrl,
      httpServer,
      "RoomOwner"
    );
    const guest = await createAuthenticatedSocket(
      serverUrl,
      httpServer,
      "RoomGuest"
    );

    try {
      const roomResponse = await owner.agent
        .post("/api/rooms")
        .send({})
        .expect(201);
      const code = roomResponse.body.room.code as string;

      const queueStatusPromise = waitForEvent<{
        state: string;
        roomCode?: string;
      }>(owner.socket, "queue:status");
      const ownerJoinResult = await emitWithAck<{
        ok: boolean;
        state?: unknown;
      }>(owner.socket, "room:join", { code });

      expect(ownerJoinResult.ok).toBe(true);
      const queueStatus = await queueStatusPromise;
      expect(queueStatus).toMatchObject({
        state: "waiting-room",
        roomCode: code
      });

      const ownerMatchStartPromise = waitForEvent<{ matchId: string }>(
        owner.socket,
        "match:start"
      );
      const guestMatchStartPromise = waitForEvent<{ matchId: string }>(
        guest.socket,
        "match:start"
      );

      const guestJoinResult = await emitWithAck<{
        ok: boolean;
        state?: { matchId: string };
      }>(guest.socket, "room:join", {
        code
      });

      expect(guestJoinResult.ok).toBe(true);

      const ownerMatchStart = await ownerMatchStartPromise;
      const guestMatchStart = await guestMatchStartPromise;
      expect(ownerMatchStart.matchId).toBe(guestMatchStart.matchId);

      const reconnectWindowPromise = waitForEvent<{
        matchId: string;
        playerId: string;
      }>(guest.socket, "match:reconnect-window");

      owner.socket.disconnect();

      const reconnectWindow = await reconnectWindowPromise;
      expect(reconnectWindow.matchId).toBe(ownerMatchStart.matchId);
      expect(reconnectWindow.playerId).toBe(owner.user.userId);
    } finally {
      owner.socket.disconnect();
      guest.socket.disconnect();
      io.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      liveMatchService.dispose();
    }
  });
});
