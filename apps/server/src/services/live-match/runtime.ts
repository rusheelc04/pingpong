import {
  type MatchMode,
  type PlayerSide,
  GAME_CONSTANTS,
  clamp,
  createServe
} from "@pingpong/shared";

import { MatchModel } from "../../models/Match.js";
import {
  advanceBotMotion,
  getBotNextTargetY,
  getBotReactionMs,
  getBotReadyY
} from "./bot.js";
import { createLivePlayer } from "./serialization.js";

import type { LiveMatch, LivePlayer, SessionUserLike } from "./types.js";

interface MatchSeat extends SessionUserLike {
  side: PlayerSide;
  socketId?: string;
  isBot?: boolean;
}

export interface CreateLiveMatchOptions {
  mode: MatchMode;
  ranked: boolean;
  roomCode?: string;
  left: MatchSeat;
  right: MatchSeat;
}

export async function createPersistedLiveMatch(
  options: CreateLiveMatchOptions
): Promise<LiveMatch> {
  const startedAt = new Date();
  const doc = await MatchModel.create({
    mode: options.mode,
    ranked: options.ranked,
    status: "live",
    roomCode: options.roomCode ?? null,
    startedAt,
    endedBy: "score",
    players: [
      {
        side: "left",
        userId: options.left.userId,
        displayName: options.left.displayName,
        ratingBefore: options.left.rating,
        ratingAfter: options.left.rating,
        avatarUrl: options.left.avatarUrl ?? null,
        isBot: options.left.isBot ?? false
      },
      {
        side: "right",
        userId: options.right.userId,
        displayName: options.right.displayName,
        ratingBefore: options.right.rating,
        ratingAfter: options.right.rating,
        avatarUrl: options.right.avatarUrl ?? null,
        isBot: options.right.isBot ?? false
      }
    ],
    replayFrames: []
  });

  return {
    id: doc._id.toString(),
    mode: options.mode,
    ranked: options.ranked,
    roomCode: options.roomCode,
    players: {
      left: createLivePlayer(options.left),
      right: createLivePlayer(options.right)
    },
    score: { left: 0, right: 0 },
    ball: createServe(),
    status: "prestart",
    resumeStatus: undefined,
    startedAt: startedAt.getTime(),
    startsAt: startedAt.getTime() + GAME_CONSTANTS.matchIntroMs,
    countdownPhase: "opening-serve",
    lastReplayCaptureAt: 0,
    replayFrames: [],
    snapshotTick: 0,
    stats: {
      rallyCount: 0,
      longestRally: 0,
      paddleHits: 0,
      maxBallSpeed: 0,
      durationSeconds: 0,
      currentRally: 0
    },
    pausesUsed: { left: 0, right: 0 }
  };
}

export function enterMatchPrestart(
  match: LiveMatch,
  countdownPhase: "opening-serve" | "point-reset",
  durationMs: number
) {
  for (const player of [match.players.left, match.players.right]) {
    if (!player.isBot) {
      continue;
    }

    const readyY = getBotReadyY();
    player.botAimOffsetY = 0;
    player.botRetargetAt = undefined;
    player.botTargetY = readyY;
    player.botVelocityY = 0;
    player.paddleY = readyY;
    player.targetY = readyY;
  }

  match.status = "prestart";
  match.startsAt = Date.now() + durationMs;
  match.countdownPhase = countdownPhase;
}

export function advanceLivePaddle(player: LivePlayer, match: LiveMatch) {
  if (player.isBot) {
    const now = Date.now();

    if (
      typeof player.botRetargetAt !== "number" ||
      player.botRetargetAt <= now
    ) {
      const nextTarget = getBotNextTargetY(match.ball, player.side);
      player.botAimOffsetY = nextTarget.aimOffsetY;
      player.botRetargetAt = now + getBotReactionMs();
      player.botTargetY = nextTarget.targetY;
    }

    const targetY = player.botTargetY ?? getBotReadyY();
    const nextMotion = advanceBotMotion({
      paddleY: player.paddleY,
      targetY,
      velocityY: player.botVelocityY ?? 0
    });

    player.targetY = targetY;
    player.botVelocityY = nextMotion.velocityY;
    player.paddleY = nextMotion.paddleY;
    return;
  }

  const delta = player.targetY - player.paddleY;
  player.paddleY += clamp(
    delta,
    -GAME_CONSTANTS.paddleSpeed,
    GAME_CONSTANTS.paddleSpeed
  );
  player.paddleY = clamp(
    player.paddleY,
    0,
    GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight
  );
}

export function captureReplayFrameIfDue(match: LiveMatch, now = Date.now()) {
  if (now - match.lastReplayCaptureAt < GAME_CONSTANTS.replayCaptureMs) {
    return false;
  }

  match.lastReplayCaptureAt = now;
  match.replayFrames.push({
    t: now - match.startedAt,
    ball: { x: match.ball.x, y: match.ball.y },
    paddles: {
      left: match.players.left.paddleY,
      right: match.players.right.paddleY
    },
    score: { ...match.score }
  });

  return true;
}
