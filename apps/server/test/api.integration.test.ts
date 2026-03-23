import request from "supertest";
import { describe, expect, test } from "vitest";

import { setupServerTestRuntime } from "./test-runtime";

const { getRuntime } = setupServerTestRuntime();

describe("API integration", () => {
  test("guest login persists a session and exposes /api/me", async () => {
    const runtime = getRuntime();
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
    const runtime = getRuntime();
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
    const runtime = getRuntime();
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
    const runtime = getRuntime();
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
    const runtime = getRuntime();
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
