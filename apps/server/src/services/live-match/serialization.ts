// Serializers are the seam between live in-memory state and the payloads the web app actually consumes.
import {
  GAME_CONSTANTS,
  type LiveMatchState,
  type MatchEndedBy,
  type MatchSummary,
  type PlayerSide,
  type PublicPlayer
} from "@pingpong/shared";

import { PAUSES_PER_PLAYER } from "./constants.js";
import { getBotReadyY } from "./bot.js";

import type { LiveMatch, LivePlayer, SessionUserLike } from "./types.js";

export function createLivePlayer(
  player: SessionUserLike & {
    side: PlayerSide;
    socketId?: string;
    isBot?: boolean;
  }
): LivePlayer {
  const initialPaddleY =
    GAME_CONSTANTS.boardHeight / 2 - GAME_CONSTANTS.paddleHeight / 2;

  return {
    userId: player.userId,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl ?? null,
    rating: player.rating,
    ratingBefore: player.rating,
    ratingAfter: player.rating,
    side: player.side,
    isBot: player.isBot ?? false,
    socketId: player.socketId,
    paddleY: initialPaddleY,
    targetY: initialPaddleY,
    botAimOffsetY: player.isBot ? 0 : undefined,
    botRetargetAt: undefined,
    botTargetY: player.isBot ? getBotReadyY() : undefined,
    botVelocityY: player.isBot ? 0 : undefined,
    connected: Boolean(player.socketId) || Boolean(player.isBot),
    lastSeenAt: Date.now()
  };
}

export function toPublicPlayer(player: LivePlayer): PublicPlayer {
  return {
    userId: player.userId,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl ?? null,
    rating: player.ratingAfter || player.ratingBefore,
    isBot: player.isBot
  };
}

export function serializeLiveState(match: LiveMatch): LiveMatchState {
  return {
    matchId: match.id,
    mode: match.mode,
    ranked: match.ranked,
    status: match.status,
    roomCode: match.roomCode,
    players: {
      left: toPublicPlayer(match.players.left),
      right: toPublicPlayer(match.players.right)
    },
    paddles: {
      left: match.players.left.paddleY,
      right: match.players.right.paddleY
    },
    ball: match.ball,
    score: match.score,
    startedAt: new Date(match.startedAt).toISOString(),
    startsAt: match.startsAt
      ? new Date(match.startsAt).toISOString()
      : undefined,
    countdownPhase: match.countdownPhase,
    reconnectDeadline: match.players.left.disconnectDeadline
      ? new Date(match.players.left.disconnectDeadline).toISOString()
      : match.players.right.disconnectDeadline
        ? new Date(match.players.right.disconnectDeadline).toISOString()
        : undefined,
    pauseInfo: match.manualPause
      ? {
          pausedBy: match.manualPause.pausedBy,
          pausedByName: match.manualPause.pausedByName,
          resumesAt: new Date(match.manualPause.resumesAt).toISOString()
        }
      : undefined,
    pausesLeft: !match.ranked
      ? {
          left: PAUSES_PER_PLAYER - (match.pausesUsed?.left ?? 0),
          right: PAUSES_PER_PLAYER - (match.pausesUsed?.right ?? 0)
        }
      : undefined,
    serverNowMs: Date.now()
  };
}

export function serializeMatchSummary(
  match: LiveMatch,
  winnerSide: PlayerSide,
  endedBy: MatchEndedBy
): MatchSummary {
  const winner = match.players[winnerSide];

  return {
    id: match.id,
    mode: match.mode,
    ranked: match.ranked,
    roomCode: match.roomCode,
    status: "ended",
    score: match.score,
    players: [
      {
        side: "left",
        userId: match.players.left.userId,
        displayName: match.players.left.displayName,
        ratingBefore: match.players.left.ratingBefore,
        ratingAfter: match.players.left.ratingAfter,
        avatarUrl: match.players.left.avatarUrl ?? null,
        isBot: match.players.left.isBot
      },
      {
        side: "right",
        userId: match.players.right.userId,
        displayName: match.players.right.displayName,
        ratingBefore: match.players.right.ratingBefore,
        ratingAfter: match.players.right.ratingAfter,
        avatarUrl: match.players.right.avatarUrl ?? null,
        isBot: match.players.right.isBot
      }
    ],
    winnerId: winner.userId,
    winnerName: winner.displayName,
    endedBy,
    startedAt: new Date(match.startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    stats: {
      rallyCount: match.stats.rallyCount,
      longestRally: match.stats.longestRally,
      paddleHits: match.stats.paddleHits,
      maxBallSpeed: match.stats.maxBallSpeed,
      durationSeconds: match.stats.durationSeconds
    },
    replayAvailable: true,
    isLive: false
  };
}
