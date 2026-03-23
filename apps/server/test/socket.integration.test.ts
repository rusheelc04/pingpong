import { describe, expect, test, vi } from "vitest";

import {
  connectSocketWithCookies,
  createAuthenticatedSocket,
  emitWithAck,
  setupServerTestRuntime,
  startRankedMatchRuntime,
  startSocketRuntime,
  stopSocketRuntime,
  waitForEvent
} from "./test-runtime";

const { getRuntime } = setupServerTestRuntime();

describe("Socket integration", () => {
  test("guest-authenticated sockets can start a practice match and chat", async () => {
    const runtime = getRuntime();
    const runtimeServer = await startSocketRuntime(runtime);
    const { socket } = await createAuthenticatedSocket(
      runtimeServer.serverUrl,
      runtimeServer.httpServer,
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
      await stopSocketRuntime(runtimeServer);
    }
  }, 15_000);

  test("private rooms start matches and emit a reconnect window when a player disconnects", async () => {
    const runtime = getRuntime();
    const runtimeServer = await startSocketRuntime(runtime);
    const owner = await createAuthenticatedSocket(
      runtimeServer.serverUrl,
      runtimeServer.httpServer,
      "RoomOwner"
    );
    const guest = await createAuthenticatedSocket(
      runtimeServer.serverUrl,
      runtimeServer.httpServer,
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
      await stopSocketRuntime(runtimeServer);
    }
  }, 15_000);

  test("the same user cannot start a second live match or create a room while active", async () => {
    const runtime = getRuntime();
    const runtimeServer = await startSocketRuntime(runtime);
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
    const runtime = getRuntime();
    const runtimeServer = await startSocketRuntime(runtime);
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
    const runtime = getRuntime();
    const runtimeServer = await startSocketRuntime(runtime);
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
    const runtime = getRuntime();
    const runtimeServer = await startSocketRuntime(runtime);
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
    const runtime = getRuntime();
    const { matchId, playerOne, playerTwo, runtimeServer } =
      await startRankedMatchRuntime(runtime);

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
    const runtime = getRuntime();
    const { matchId, playerOne, playerTwo, runtimeServer } =
      await startRankedMatchRuntime(
        runtime,
        "RetryRankedOne",
        "RetryRankedTwo"
      );
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
    const runtime = getRuntime();
    const { matchId, playerOne, playerTwo, runtimeServer } =
      await startRankedMatchRuntime(runtime, "FailRankedOne", "FailRankedTwo");
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
