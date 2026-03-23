// The REST layer handles session bootstrap, history reads, and room creation around the live socket engine.
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response
} from "express";
import { nanoid } from "nanoid";

import type { ChatMessage, MatchSummary, SessionUser } from "@pingpong/shared";
import { GAME_CONSTANTS, guestSessionSchema } from "@pingpong/shared";

import { isDatabaseReady } from "../db.js";
import { logger } from "../logger.js";
import { MatchModel, type MatchDocument } from "../models/Match.js";
import { MessageModel, type MessageDocument } from "../models/Message.js";
import { UserModel, type UserDocument } from "../models/User.js";
import {
  LIVE_MATCH_ERRORS,
  type LiveMatchService
} from "../services/liveMatchService.js";

function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

function serializeUser(user: UserDocument): SessionUser {
  return {
    userId: user._id.toString(),
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    rating: user.rating,
    provider: user.provider
  };
}

function serializeMessage(message: MessageDocument): ChatMessage {
  return {
    id: message._id.toString(),
    matchId: message.matchId,
    senderId: message.senderId,
    senderName: message.senderName,
    body: message.body,
    createdAt: message.createdAt.toISOString()
  };
}

function serializeCompletedMatch(match: MatchDocument): MatchSummary {
  return {
    id: match._id.toString(),
    mode: match.mode,
    ranked: match.ranked,
    roomCode: match.roomCode,
    status: "ended",
    score: match.score,
    players: match.players,
    winnerId: match.winnerId,
    winnerName: match.winnerName,
    endedBy: match.endedBy,
    startedAt: match.startedAt.toISOString(),
    endedAt:
      match.endedAt?.toISOString() ?? new Date(match.startedAt).toISOString(),
    stats: match.stats,
    replayAvailable: match.replayFrames.length > 0,
    isLive: false
  };
}

function userParticipatedInMatch(match: MatchDocument, userId: string) {
  return match.players.some((player) => player.userId === userId);
}

function destroySession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function createApiRouter(liveMatchService: LiveMatchService) {
  const router = Router();

  router.post(
    "/auth/guest",
    asyncHandler(async (req, res) => {
      const parsed = guestSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Invalid display name."
        });
        return;
      }

      const displayName = parsed.data.displayName.trim();
      const existingUser = req.session.userId
        ? await UserModel.findById(req.session.userId)
        : null;

      if (existingUser) {
        existingUser.displayName = displayName;
        await existingUser.save();
        res.json({ user: serializeUser(existingUser) });
        return;
      }

      const user = await UserModel.create({
        displayName,
        provider: "guest",
        providerId: nanoid()
      });

      // Guest auth is the first time we trust this browser, so we rotate the session id here.
      await regenerateSession(req);
      req.session.userId = user._id.toString();
      res.json({ user: serializeUser(user) });
    })
  );

  router.get(
    "/me",
    asyncHandler(async (req, res) => {
      if (!req.session.userId) {
        res.json({ user: null, activeMatchId: null });
        return;
      }

      const user = await UserModel.findById(req.session.userId);
      if (!user) {
        try {
          await destroySession(req);
        } catch (error) {
          logger.warn(
            { err: error },
            "Could not clear a stale session after /api/me."
          );
        }

        res.json({ user: null, activeMatchId: null });
        return;
      }

      res.json({
        user: serializeUser(user),
        activeMatchId: liveMatchService.getActiveMatchForUser(
          user._id.toString()
        )
      });
    })
  );

  router.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      await destroySession(req);
      res.clearCookie("connect.sid");
      res.json({ success: true });
    })
  );

  router.get(
    "/leaderboard",
    asyncHandler(async (_req, res) => {
      const users = await UserModel.find()
        .sort({ rating: -1, wins: -1 })
        .limit(25);
      res.json({
        leaderboard: users.map((user, index) => ({
          rank: index + 1,
          userId: user._id.toString(),
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          rating: user.rating,
          wins: user.wins,
          losses: user.losses,
          matchesPlayed: user.matchesPlayed
        }))
      });
    })
  );

  router.get(
    "/matches",
    asyncHandler(async (req, res) => {
      if (!req.session.userId) {
        res.status(401).json({ error: "Sign in as a guest first." });
        return;
      }

      const matches = await MatchModel.find({
        "players.userId": req.session.userId,
        status: "ended"
      })
        .sort({ endedAt: -1 })
        .limit(20);

      res.json({
        matches: matches.map(serializeCompletedMatch)
      });
    })
  );

  router.get(
    "/matches/:id",
    asyncHandler(async (req, res) => {
      if (!req.session.userId) {
        res.status(401).json({ error: "Sign in as a guest first." });
        return;
      }

      const matchId = String(req.params.id);
      const match = await MatchModel.findById(matchId);
      const liveState = liveMatchService.getMatchState(matchId);
      if (!match && !liveState) {
        res.status(404).json({ error: "Match not found." });
        return;
      }

      const canAccess = match
        ? userParticipatedInMatch(match, req.session.userId)
        : liveMatchService.canUserAccessMatch(matchId, req.session.userId);
      if (!canAccess) {
        res
          .status(403)
          .json({ error: LIVE_MATCH_ERRORS.unauthorizedMatchAccess });
        return;
      }

      const messages = await MessageModel.find({ matchId })
        .sort({ createdAt: 1 })
        .limit(50);

      res.json({
        match:
          match?.status === "ended" ? serializeCompletedMatch(match) : null,
        liveState,
        messages: messages.map(serializeMessage)
      });
    })
  );

  router.get(
    "/matches/:id/replay",
    asyncHandler(async (req, res) => {
      if (!req.session.userId) {
        res.status(401).json({ error: "Sign in as a guest first." });
        return;
      }

      const match = await MatchModel.findById(String(req.params.id));
      if (!match || match.status !== "ended") {
        res.status(404).json({ error: "Replay not found." });
        return;
      }

      if (!userParticipatedInMatch(match, req.session.userId)) {
        res
          .status(403)
          .json({ error: LIVE_MATCH_ERRORS.unauthorizedMatchAccess });
        return;
      }

      res.json({
        replay: {
          matchId: match._id.toString(),
          frames: match.replayFrames,
          score: match.score,
          winnerId: match.winnerId,
          winnerName: match.winnerName,
          stats: match.stats,
          captureMs: GAME_CONSTANTS.replayCaptureMs
        }
      });
    })
  );

  router.post(
    "/rooms",
    asyncHandler(async (req, res) => {
      if (!req.session.userId) {
        res.status(401).json({ error: "Sign in as a guest first." });
        return;
      }

      const user = await UserModel.findById(req.session.userId);
      if (!user) {
        res.status(401).json({ error: "Session expired." });
        return;
      }

      try {
        const room = liveMatchService.createPrivateRoom({
          userId: user._id.toString(),
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          provider: user.provider,
          rating: user.rating
        });

        res.status(201).json({ room });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === LIVE_MATCH_ERRORS.alreadyInLiveMatch
        ) {
          res.status(409).json({ error: error.message });
          return;
        }

        if (
          error instanceof Error &&
          error.message === LIVE_MATCH_ERRORS.maintenanceOrDraining
        ) {
          res.status(503).json({ error: error.message });
          return;
        }

        throw error;
      }
    })
  );

  router.get("/healthz", (_req, res) => {
    const ok = isDatabaseReady();
    res.status(ok ? 200 : 503).json({ ok, uptime: process.uptime() });
  });

  return router;
}
