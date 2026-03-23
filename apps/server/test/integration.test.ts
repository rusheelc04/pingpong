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
  test,
  vi
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
  canUseTransactions: typeof DbModule.canUseTransactions;
  createApp: typeof AppModule.createApp;
  disconnectFromDatabase: typeof DbModule.disconnectFromDatabase;
  initializeSocket: typeof SocketModule.initializeSocket;
  LiveMatchService: typeof ServiceModule.LiveMatchService;
  LIVE_MATCH_ERRORS: typeof ServiceModule.LIVE_MATCH_ERRORS;
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
    canUseTransactions: dbModule.canUseTransactions,
    createApp: appModule.createApp,
    disconnectFromDatabase: dbModule.disconnectFromDatabase,
    initializeSocket: socketModule.initializeSocket,
    LiveMatchService: serviceModule.LiveMatchService,
    LIVE_MATCH_ERRORS: serviceModule.LIVE_MATCH_ERRORS
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

async function connectSocketWithCookies(
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

async function startSocketRuntime() {
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

async function stopSocketRuntime(runtimeServer: {
  httpServer: ReturnType<typeof createServer>;
  io: ReturnType<typeof runtime.initializeSocket>;
  liveMatchService: InstanceType<typeof runtime.LiveMatchService>;
}) {
  runtimeServer.io.close();
  await new Promise<void>((resolve, reject) => {
    runtimeServer.httpServer.close((error) =>
      error ? reject(error) : resolve()
    );
  });
  runtimeServer.liveMatchService.dispose();
}

async function startRankedMatchRuntime(
  playerOneName = "RankedOne",
  playerTwoName = "RankedTwo"
) {
  const runtimeServer = await startSocketRuntime();
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
  expect(firstQueueJoin.ok).toBe(true);

  const secondQueueJoin = await emitWithAck<{ ok: boolean }>(
    playerTwo.socket,
    "queue:join",
    { mode: "ranked" }
  );
  expect(secondQueueJoin.ok).toBe(true);

  const matchOne = await playerOneStartPromise;
  const matchTwo = await playerTwoStartPromise;
  expect(matchOne.matchId).toBe(matchTwo.matchId);

  return {
    matchId: matchOne.matchId,
    playerOne,
    playerTwo,
    runtimeServer
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

  test("match detail and replay stay participant-only", async () => {
    const liveMatchService = new runtime.LiveMatchService();
    const { app } = await runtime.createApp(liveMatchService);
    const ownerAgent = request.agent(app);
    const outsiderAgent = request.agent(app);

    const ownerLogin = await ownerAgent
      .post("/api/auth/guest")
      .send({ displayName: "OwnerOnly" })
      .expect(200);
    await outsiderAgent
      .post("/api/auth/guest")
      .send({ displayName: "Outsider" })
      .expect(200);

    const ownerUser = ownerLogin.body.user as {
      userId: string;
      displayName: string;
    };

    const match = await runtime.MatchModel.create({
      mode: "private",
      ranked: false,
      status: "ended",
      roomCode: "ABCD12",
      players: [
        {
          side: "left",
          userId: ownerUser.userId,
          displayName: ownerUser.displayName,
          ratingBefore: 1000,
          ratingAfter: 1000,
          avatarUrl: null,
          isBot: false
        },
        {
          side: "right",
          userId: "guest-2",
          displayName: "Friend",
          ratingBefore: 1000,
          ratingAfter: 1000,
          avatarUrl: null,
          isBot: false
        }
      ],
      score: { left: 11, right: 9 },
      winnerId: ownerUser.userId,
      winnerName: ownerUser.displayName,
      endedBy: "score",
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      endedAt: new Date("2026-01-01T00:05:00.000Z"),
      stats: {
        rallyCount: 8,
        longestRally: 4,
        paddleHits: 15,
        maxBallSpeed: 11.1,
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

    await outsiderAgent
      .get(`/api/matches/${match._id}`)
      .expect(403)
      .expect(({ body }) => {
        expect(body.error).toBe(
          runtime.LIVE_MATCH_ERRORS.unauthorizedMatchAccess
        );
      });

    await outsiderAgent
      .get(`/api/matches/${match._id}/replay`)
      .expect(403)
      .expect(({ body }) => {
        expect(body.error).toBe(
          runtime.LIVE_MATCH_ERRORS.unauthorizedMatchAccess
        );
      });

    liveMatchService.dispose();
  });

  test("startup cleanup removes stale live matches and orphan chat", async () => {
    const firstService = new runtime.LiveMatchService();
    await runtime.createApp(firstService);

    const staleMatch = await runtime.MatchModel.create({
      mode: "practice",
      ranked: false,
      status: "live",
      roomCode: null,
      players: [
        {
          side: "left",
          userId: "player-1",
          displayName: "Player One",
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
      replayFrames: []
    });

    await runtime.MessageModel.create({
      matchId: staleMatch._id.toString(),
      senderId: "player-1",
      senderName: "Player One",
      body: "stale",
      createdAt: new Date()
    });

    firstService.dispose();

    const secondService = new runtime.LiveMatchService();
    await runtime.createApp(secondService);

    expect(await runtime.MatchModel.findById(staleMatch._id)).toBeNull();
    expect(
      await runtime.MessageModel.countDocuments({
        matchId: staleMatch._id.toString()
      })
    ).toBe(0);

    secondService.dispose();
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
  }, 15_000);

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
  }, 15_000);

  test("the same user cannot start a second live match or create a room while active", async () => {
    const runtimeServer = await startSocketRuntime();
    const primary = await createAuthenticatedSocket(
      runtimeServer.serverUrl,
      runtimeServer.httpServer,
      "DuplicateGuard"
    );
    const duplicateSocket = await connectSocketWithCookies(
      runtimeServer.serverUrl,
      primary.cookiesHeader
    );

    try {
      const firstJoin = await emitWithAck<{
        ok: boolean;
        status?: { matchId: string };
      }>(primary.socket, "queue:join", {
        mode: "practice"
      });

      expect(firstJoin.ok).toBe(true);
      expect(firstJoin.status?.matchId).toBeTruthy();

      const secondJoin = await emitWithAck<{
        ok: boolean;
        error?: string;
      }>(duplicateSocket, "queue:join", {
        mode: "practice"
      });

      expect(secondJoin.ok).toBe(false);
      expect(secondJoin.error).toBe(
        runtime.LIVE_MATCH_ERRORS.alreadyInLiveMatch
      );

      await primary.agent
        .post("/api/rooms")
        .send({})
        .expect(409)
        .expect(({ body }) => {
          expect(body.error).toBe(runtime.LIVE_MATCH_ERRORS.alreadyInLiveMatch);
        });
    } finally {
      primary.socket.disconnect();
      duplicateSocket.disconnect();
      await stopSocketRuntime(runtimeServer);
    }
  }, 15_000);

  test("unauthorized users cannot send chat into someone else's live match", async () => {
    const runtimeServer = await startSocketRuntime();
    const owner = await createAuthenticatedSocket(
      runtimeServer.serverUrl,
      runtimeServer.httpServer,
      "ChatOwner"
    );
    const guest = await createAuthenticatedSocket(
      runtimeServer.serverUrl,
      runtimeServer.httpServer,
      "ChatGuest"
    );
    const outsider = await createAuthenticatedSocket(
      runtimeServer.serverUrl,
      runtimeServer.httpServer,
      "ChatOutsider"
    );

    try {
      const roomResponse = await owner.agent
        .post("/api/rooms")
        .send({})
        .expect(201);
      const code = roomResponse.body.room.code as string;

      await emitWithAck(owner.socket, "room:join", { code });
      const matchStartPromise = waitForEvent<{ matchId: string }>(
        owner.socket,
        "match:start"
      );
      await emitWithAck(guest.socket, "room:join", { code });
      const matchStart = await matchStartPromise;

      const unauthorizedChat = await emitWithAck<{
        ok: boolean;
        error?: string;
      }>(outsider.socket, "chat:send", {
        matchId: matchStart.matchId,
        body: "let me in"
      });

      expect(unauthorizedChat.ok).toBe(false);
      expect(unauthorizedChat.error).toBe(
        runtime.LIVE_MATCH_ERRORS.unauthorizedChatAccess
      );
    } finally {
      owner.socket.disconnect();
      guest.socket.disconnect();
      outsider.socket.disconnect();
      await stopSocketRuntime(runtimeServer);
    }
  }, 15_000);

  test("players can reconnect within the grace window by resuming the same match", async () => {
    const runtimeServer = await startSocketRuntime();
    const owner = await createAuthenticatedSocket(
      runtimeServer.serverUrl,
      runtimeServer.httpServer,
      "ReconnectOwner"
    );
    const guest = await createAuthenticatedSocket(
      runtimeServer.serverUrl,
      runtimeServer.httpServer,
      "ReconnectGuest"
    );

    try {
      const roomResponse = await owner.agent
        .post("/api/rooms")
        .send({})
        .expect(201);
      const code = roomResponse.body.room.code as string;

      await emitWithAck(owner.socket, "room:join", { code });
      const ownerMatchStartPromise = waitForEvent<{ matchId: string }>(
        owner.socket,
        "match:start"
      );
      await emitWithAck(guest.socket, "room:join", { code });
      const ownerMatchStart = await ownerMatchStartPromise;

      const reconnectWindowPromise = waitForEvent<{
        matchId: string;
        playerId: string;
      }>(guest.socket, "match:reconnect-window");
      owner.socket.disconnect();
      await reconnectWindowPromise;

      const replacementSocket = await connectSocketWithCookies(
        runtimeServer.serverUrl,
        owner.cookiesHeader
      );

      try {
        const resumeResult = await emitWithAck<{
          ok: boolean;
          state?: { matchId: string; status: string };
        }>(replacementSocket, "match:resume", {
          matchId: ownerMatchStart.matchId
        });

        expect(resumeResult.ok).toBe(true);
        expect(resumeResult.state?.matchId).toBe(ownerMatchStart.matchId);
        expect(["prestart", "live"]).toContain(resumeResult.state?.status);
      } finally {
        replacementSocket.disconnect();
      }
    } finally {
      guest.socket.disconnect();
      await stopSocketRuntime(runtimeServer);
    }
  }, 15_000);

  test("disconnect timeouts end the match by forfeit", async () => {
    const runtimeServer = await startSocketRuntime();
    const owner = await createAuthenticatedSocket(
      runtimeServer.serverUrl,
      runtimeServer.httpServer,
      "ForfeitOwner"
    );
    const guest = await createAuthenticatedSocket(
      runtimeServer.serverUrl,
      runtimeServer.httpServer,
      "ForfeitGuest"
    );

    try {
      const roomResponse = await owner.agent
        .post("/api/rooms")
        .send({})
        .expect(201);
      const code = roomResponse.body.room.code as string;

      await emitWithAck(owner.socket, "room:join", { code });
      const ownerMatchStartPromise = waitForEvent<{ matchId: string }>(
        owner.socket,
        "match:start"
      );
      await emitWithAck(guest.socket, "room:join", { code });
      const ownerMatchStart = await ownerMatchStartPromise;

      const serviceAccess = runtimeServer.liveMatchService as unknown as {
        liveMatches: Map<
          string,
          {
            players: {
              left: { disconnectDeadline?: number; userId: string };
              right: { disconnectDeadline?: number; userId: string };
            };
          }
        >;
        tickMatch: (matchId: string) => Promise<void>;
      };

      const reconnectWindowPromise = waitForEvent<{
        matchId: string;
        playerId: string;
      }>(guest.socket, "match:reconnect-window");
      owner.socket.disconnect();
      await reconnectWindowPromise;

      const matchEndPromise = waitForEvent<{
        summary: { endedBy: string };
      }>(guest.socket, "match:end");

      const liveMatch = serviceAccess.liveMatches.get(ownerMatchStart.matchId);
      if (!liveMatch) {
        throw new Error("Expected live match to exist for forfeit test.");
      }

      liveMatch.players.left.disconnectDeadline = Date.now() - 1;
      await serviceAccess.tickMatch(ownerMatchStart.matchId);

      const matchEnd = await matchEndPromise;
      expect(matchEnd.summary.endedBy).toBe("forfeit");
    } finally {
      guest.socket.disconnect();
      await stopSocketRuntime(runtimeServer);
    }
  }, 15_000);

  test("ranked match completion updates persisted ratings", async () => {
    const { matchId, playerOne, playerTwo, runtimeServer } =
      await startRankedMatchRuntime();

    try {
      expect(runtime.canUseTransactions()).toBe(true);

      const serviceAccess = runtimeServer.liveMatchService as unknown as {
        liveMatches: Map<string, unknown>;
        finishMatch: (
          match: unknown,
          winnerSide: "left" | "right",
          endedBy: "score" | "forfeit"
        ) => Promise<void>;
      };

      const liveMatch = serviceAccess.liveMatches.get(matchId);
      if (!liveMatch) {
        throw new Error("Expected ranked live match to exist.");
      }

      const matchEndPromise = waitForEvent<{
        ratingDelta: number;
      }>(playerOne.socket, "match:end");

      await serviceAccess.finishMatch(liveMatch, "left", "score");

      const matchEnd = await matchEndPromise;
      expect(matchEnd.ratingDelta).toBeGreaterThan(0);

      const [winner, loser] = await Promise.all([
        runtime.UserModel.findById(playerOne.user.userId),
        runtime.UserModel.findById(playerTwo.user.userId)
      ]);

      expect(winner?.rating ?? 0).toBeGreaterThan(1000);
      expect(loser?.rating ?? 0).toBeLessThan(1000);
      expect(winner?.wins).toBe(1);
      expect(loser?.losses).toBe(1);
    } finally {
      playerOne.socket.disconnect();
      playerTwo.socket.disconnect();
      await stopSocketRuntime(runtimeServer);
    }
  }, 15_000);

  test("ranked finalization retries once and still commits safely", async () => {
    const { matchId, playerOne, playerTwo, runtimeServer } =
      await startRankedMatchRuntime("RetryRankedOne", "RetryRankedTwo");
    const originalFindByIdAndUpdate = runtime.MatchModel.findByIdAndUpdate.bind(
      runtime.MatchModel
    );
    let updateAttempts = 0;
    const matchUpdateSpy = vi
      .spyOn(runtime.MatchModel, "findByIdAndUpdate")
      .mockImplementation(async (...args) => {
        updateAttempts += 1;
        if (updateAttempts === 1) {
          throw new Error("Injected match finalization failure.");
        }

        return await originalFindByIdAndUpdate(
          ...(args as Parameters<typeof runtime.MatchModel.findByIdAndUpdate>)
        );
      });

    try {
      const serviceAccess = runtimeServer.liveMatchService as unknown as {
        liveMatches: Map<string, unknown>;
        finishMatch: (
          match: unknown,
          winnerSide: "left" | "right",
          endedBy: "score" | "forfeit"
        ) => Promise<void>;
      };

      const liveMatch = serviceAccess.liveMatches.get(matchId);
      if (!liveMatch) {
        throw new Error("Expected ranked live match to exist.");
      }

      const matchEndPromise = waitForEvent<{
        ratingDelta: number;
        summary: { winnerId: string };
      }>(playerOne.socket, "match:end");

      await serviceAccess.finishMatch(liveMatch, "left", "score");

      const matchEnd = await matchEndPromise;
      expect(matchEnd.ratingDelta).toBeGreaterThan(0);
      expect(matchEnd.summary.winnerId).toBe(playerOne.user.userId);
      expect(updateAttempts).toBe(2);

      const [winner, loser, persistedMatch] = await Promise.all([
        runtime.UserModel.findById(playerOne.user.userId),
        runtime.UserModel.findById(playerTwo.user.userId),
        runtime.MatchModel.findById(matchId)
      ]);

      expect(winner?.wins).toBe(1);
      expect(loser?.losses).toBe(1);
      expect(persistedMatch?.status).toBe("ended");
      expect(persistedMatch?.winnerId).toBe(playerOne.user.userId);
    } finally {
      matchUpdateSpy.mockRestore();
      playerOne.socket.disconnect();
      playerTwo.socket.disconnect();
      await stopSocketRuntime(runtimeServer);
    }
  }, 15_000);

  test("ranked finalization emits a recovery event and avoids partial writes after repeated failures", async () => {
    const { matchId, playerOne, playerTwo, runtimeServer } =
      await startRankedMatchRuntime("FailRankedOne", "FailRankedTwo");
    const matchUpdateSpy = vi
      .spyOn(runtime.MatchModel, "findByIdAndUpdate")
      .mockRejectedValue(
        new Error("Injected persistent finalization failure.")
      );

    try {
      const serviceAccess = runtimeServer.liveMatchService as unknown as {
        finishMatch: (
          match: unknown,
          winnerSide: "left" | "right",
          endedBy: "score" | "forfeit"
        ) => Promise<void>;
        getActiveMatchForUser: (userId: string) => string | null;
        liveMatches: Map<string, unknown>;
      };

      const liveMatch = serviceAccess.liveMatches.get(matchId);
      if (!liveMatch) {
        throw new Error("Expected ranked live match to exist.");
      }

      const finalizationErrorPromise = waitForEvent<{
        error: string;
        matchId: string;
      }>(playerOne.socket, "match:finalization-error");

      await serviceAccess.finishMatch(liveMatch, "left", "score");

      const finalizationError = await finalizationErrorPromise;
      expect(finalizationError).toMatchObject({
        error: runtime.LIVE_MATCH_ERRORS.finalizationFailed,
        matchId
      });

      const [winner, loser, persistedMatch] = await Promise.all([
        runtime.UserModel.findById(playerOne.user.userId),
        runtime.UserModel.findById(playerTwo.user.userId),
        runtime.MatchModel.findById(matchId)
      ]);

      expect(winner?.rating).toBe(1000);
      expect(loser?.rating).toBe(1000);
      expect(winner?.wins).toBe(0);
      expect(loser?.losses).toBe(0);
      expect(persistedMatch?.status).toBe("live");
      expect(serviceAccess.getActiveMatchForUser(playerOne.user.userId)).toBe(
        null
      );
      expect(serviceAccess.getActiveMatchForUser(playerTwo.user.userId)).toBe(
        null
      );
      expect(serviceAccess.liveMatches.has(matchId)).toBe(false);
    } finally {
      matchUpdateSpy.mockRestore();
      playerOne.socket.disconnect();
      playerTwo.socket.disconnect();
      await stopSocketRuntime(runtimeServer);
    }
  }, 15_000);
});
