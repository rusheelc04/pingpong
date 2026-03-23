import mongoose from "mongoose";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test
} from "vitest";

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-session-secret";
delete process.env.MONGO_URI;

async function loadRuntime() {
  const [
    { MatchModel },
    { MessageModel },
    { UserModel },
    appModule,
    dbModule,
    serviceModule,
    smokeCleanupModule
  ] = await Promise.all([
    import("../src/models/Match.js"),
    import("../src/models/Message.js"),
    import("../src/models/User.js"),
    import("../src/app.js"),
    import("../src/db.js"),
    import("../src/services/liveMatchService.js"),
    import("../../../scripts/lib/smoke-cleanup.mjs")
  ]);

  return {
    MatchModel,
    MessageModel,
    UserModel,
    cleanupSmokeTestArtifacts: smokeCleanupModule.cleanupSmokeTestArtifacts,
    connectToDatabase: dbModule.connectToDatabase,
    createApp: appModule.createApp,
    disconnectFromDatabase: dbModule.disconnectFromDatabase,
    LiveMatchService: serviceModule.LiveMatchService
  };
}

type Runtime = Awaited<ReturnType<typeof loadRuntime>>;

let runtime: Runtime;

beforeAll(async () => {
  runtime = await loadRuntime();

  await runtime.connectToDatabase();
});

beforeEach(async () => {
  if (mongoose.connection.readyState !== 0 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
});

afterAll(async () => {
  await runtime.disconnectFromDatabase();
});

describe("leaderboard", () => {
  test("only ranked human results count toward the public ladder", async () => {
    const liveMatchService = new runtime.LiveMatchService();
    const { app } = await runtime.createApp(liveMatchService);

    try {
      await runtime.UserModel.create({
        displayName: "FreshGuest",
        provider: "guest",
        providerId: "fresh-guest"
      });

      await runtime.MatchModel.create([
        {
          mode: "ranked",
          ranked: true,
          status: "ended",
          players: [
            {
              side: "left",
              userId: "ace",
              displayName: "Ace",
              ratingBefore: 1000,
              ratingAfter: 1016,
              avatarUrl: null,
              isBot: false
            },
            {
              side: "right",
              userId: "blaze",
              displayName: "Blaze",
              ratingBefore: 1000,
              ratingAfter: 984,
              avatarUrl: null,
              isBot: false
            }
          ],
          score: { left: 11, right: 7 },
          winnerId: "ace",
          winnerName: "Ace",
          endedBy: "score",
          startedAt: new Date("2026-03-22T10:00:00.000Z"),
          endedAt: new Date("2026-03-22T10:06:00.000Z"),
          stats: {
            rallyCount: 18,
            longestRally: 6,
            paddleHits: 28,
            maxBallSpeed: 12.8,
            durationSeconds: 360
          },
          replayFrames: []
        },
        {
          mode: "ranked",
          ranked: true,
          status: "ended",
          players: [
            {
              side: "left",
              userId: "blaze",
              displayName: "Blaze",
              ratingBefore: 984,
              ratingAfter: 1000,
              avatarUrl: null,
              isBot: false
            },
            {
              side: "right",
              userId: "cora",
              displayName: "Cora",
              ratingBefore: 1000,
              ratingAfter: 968,
              avatarUrl: null,
              isBot: false
            }
          ],
          score: { left: 11, right: 8 },
          winnerId: "blaze",
          winnerName: "Blaze",
          endedBy: "score",
          startedAt: new Date("2026-03-21T10:00:00.000Z"),
          endedAt: new Date("2026-03-21T10:06:00.000Z"),
          stats: {
            rallyCount: 16,
            longestRally: 5,
            paddleHits: 24,
            maxBallSpeed: 12.1,
            durationSeconds: 360
          },
          replayFrames: []
        },
        {
          mode: "practice",
          ranked: false,
          status: "ended",
          players: [
            {
              side: "left",
              userId: "practice-player",
              displayName: "PracticeHero",
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
          score: { left: 9, right: 11 },
          winnerId: "bot-1",
          winnerName: "Arcade Bot",
          endedBy: "score",
          startedAt: new Date("2026-03-22T09:00:00.000Z"),
          endedAt: new Date("2026-03-22T09:05:00.000Z"),
          stats: {
            rallyCount: 12,
            longestRally: 4,
            paddleHits: 18,
            maxBallSpeed: 11.2,
            durationSeconds: 300
          },
          replayFrames: []
        },
        {
          mode: "private",
          ranked: false,
          status: "ended",
          players: [
            {
              side: "left",
              userId: "private-one",
              displayName: "PrivateOne",
              ratingBefore: 1000,
              ratingAfter: 1000,
              avatarUrl: null,
              isBot: false
            },
            {
              side: "right",
              userId: "private-two",
              displayName: "PrivateTwo",
              ratingBefore: 1000,
              ratingAfter: 1000,
              avatarUrl: null,
              isBot: false
            }
          ],
          score: { left: 11, right: 9 },
          winnerId: "private-one",
          winnerName: "PrivateOne",
          endedBy: "score",
          startedAt: new Date("2026-03-22T08:00:00.000Z"),
          endedAt: new Date("2026-03-22T08:06:00.000Z"),
          stats: {
            rallyCount: 15,
            longestRally: 5,
            paddleHits: 22,
            maxBallSpeed: 11.5,
            durationSeconds: 360
          },
          replayFrames: []
        }
      ]);

      const response = await request(app).get("/api/leaderboard").expect(200);

      expect(response.body.leaderboard).toEqual([
        expect.objectContaining({
          rank: 1,
          userId: "ace",
          displayName: "Ace",
          rating: 1016,
          wins: 1,
          losses: 0,
          matchesPlayed: 1
        }),
        expect.objectContaining({
          rank: 2,
          userId: "blaze",
          displayName: "Blaze",
          rating: 984,
          wins: 1,
          losses: 1,
          matchesPlayed: 2
        }),
        expect.objectContaining({
          rank: 3,
          userId: "cora",
          displayName: "Cora",
          rating: 968,
          wins: 0,
          losses: 1,
          matchesPlayed: 1
        })
      ]);

      expect(
        response.body.leaderboard.find(
          (entry: { displayName: string }) =>
            entry.displayName === "PracticeHero" ||
            entry.displayName === "PrivateOne" ||
            entry.displayName === "FreshGuest"
        )
      ).toBeUndefined();
    } finally {
      liveMatchService.dispose();
    }
  });
});

describe("smoke cleanup", () => {
  test("deletes known smoke accounts and their related matches and messages only", async () => {
    const [renderSmoke, debugSmoke, normalUser] =
      await runtime.UserModel.create([
        {
          displayName: "RenderSmoke1670000000000",
          provider: "guest",
          providerId: "render-smoke"
        },
        {
          displayName: "DebugSmoke1670000000001",
          provider: "guest",
          providerId: "debug-smoke"
        },
        {
          displayName: "RealPlayer",
          provider: "guest",
          providerId: "real-player"
        }
      ]);

    const [smokeMatch, normalMatch] = await runtime.MatchModel.create([
      {
        mode: "practice",
        ranked: false,
        status: "ended",
        players: [
          {
            side: "left",
            userId: renderSmoke._id.toString(),
            displayName: renderSmoke.displayName,
            ratingBefore: 1000,
            ratingAfter: 1000,
            avatarUrl: null,
            isBot: false
          },
          {
            side: "right",
            userId: debugSmoke._id.toString(),
            displayName: debugSmoke.displayName,
            ratingBefore: 1000,
            ratingAfter: 1000,
            avatarUrl: null,
            isBot: false
          }
        ],
        score: { left: 3, right: 11 },
        winnerId: debugSmoke._id.toString(),
        winnerName: debugSmoke.displayName,
        endedBy: "forfeit",
        startedAt: new Date("2026-03-22T11:00:00.000Z"),
        endedAt: new Date("2026-03-22T11:01:00.000Z"),
        stats: {
          rallyCount: 4,
          longestRally: 2,
          paddleHits: 6,
          maxBallSpeed: 9.4,
          durationSeconds: 60
        },
        replayFrames: []
      },
      {
        mode: "ranked",
        ranked: true,
        status: "ended",
        players: [
          {
            side: "left",
            userId: normalUser._id.toString(),
            displayName: normalUser.displayName,
            ratingBefore: 1000,
            ratingAfter: 1016,
            avatarUrl: null,
            isBot: false
          },
          {
            side: "right",
            userId: "opponent",
            displayName: "Opponent",
            ratingBefore: 1000,
            ratingAfter: 984,
            avatarUrl: null,
            isBot: false
          }
        ],
        score: { left: 11, right: 8 },
        winnerId: normalUser._id.toString(),
        winnerName: normalUser.displayName,
        endedBy: "score",
        startedAt: new Date("2026-03-22T12:00:00.000Z"),
        endedAt: new Date("2026-03-22T12:05:00.000Z"),
        stats: {
          rallyCount: 10,
          longestRally: 4,
          paddleHits: 14,
          maxBallSpeed: 10.8,
          durationSeconds: 300
        },
        replayFrames: []
      }
    ]);

    await runtime.MessageModel.create([
      {
        matchId: smokeMatch._id.toString(),
        senderId: renderSmoke._id.toString(),
        senderName: renderSmoke.displayName,
        body: "cleanup me"
      },
      {
        matchId: normalMatch._id.toString(),
        senderId: normalUser._id.toString(),
        senderName: normalUser.displayName,
        body: "keep me"
      }
    ]);

    const summary = await runtime.cleanupSmokeTestArtifacts({
      MatchModel: runtime.MatchModel,
      MessageModel: runtime.MessageModel,
      UserModel: runtime.UserModel
    });

    expect(summary.deletedUserCount).toBe(2);
    expect(summary.deletedMatchCount).toBe(1);
    expect(summary.deletedMessageCount).toBe(1);
    expect(
      summary.users
        .map((user) => user.displayName)
        .sort((left, right) => left.localeCompare(right))
    ).toEqual(["DebugSmoke1670000000001", "RenderSmoke1670000000000"]);

    expect(await runtime.UserModel.countDocuments()).toBe(1);
    expect(await runtime.MatchModel.countDocuments()).toBe(1);
    expect(await runtime.MessageModel.countDocuments()).toBe(1);
    expect(
      await runtime.UserModel.findOne({ displayName: "RealPlayer" })
    ).not.toBeNull();
    expect(await runtime.MatchModel.findById(normalMatch._id)).not.toBeNull();
  });
});
