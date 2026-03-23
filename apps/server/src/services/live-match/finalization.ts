import mongoose from "mongoose";
import {
  type MatchEndedBy,
  type MatchFinalizationErrorPayload,
  type MatchSummary,
  type PlayerSide,
  calculateRatingDelta
} from "@pingpong/shared";

import { isProduction } from "../../config.js";
import { canUseTransactions } from "../../db.js";
import { logger } from "../../logger.js";
import { MatchModel } from "../../models/Match.js";
import { UserModel } from "../../models/User.js";
import {
  MATCH_FINALIZATION_ATTEMPTS,
  MATCH_FINALIZATION_RETRY_MS
} from "./constants.js";
import { serializeMatchSummary } from "./serialization.js";

import type { LiveMatch, LivePlayer } from "./types.js";

export interface FinalizedPlayerSnapshot {
  side: PlayerSide;
  userId: string;
  displayName: string;
  ratingBefore: number;
  ratingAfter: number;
  avatarUrl?: string | null;
  isBot?: boolean;
}

export interface MatchFinalizationContext {
  endedAt: Date;
  endedBy: MatchEndedBy;
  loser: LivePlayer;
  match: LiveMatch;
  persistedPlayers: [FinalizedPlayerSnapshot, FinalizedPlayerSnapshot];
  rankedHumanMatch: boolean;
  ratingDelta: number;
  summary: MatchSummary;
  winner: LivePlayer;
}

interface PersistMatchFinalizationOptions {
  finalizationErrorCode: string;
  warnedAboutSequentialFallback: boolean;
}

export function prepareMatchFinalization(
  match: LiveMatch,
  winnerSide: PlayerSide,
  endedBy: MatchEndedBy
): MatchFinalizationContext {
  const winner = match.players[winnerSide];
  const loser = match.players[winnerSide === "left" ? "right" : "left"];
  const rankedHumanMatch = match.ranked && !winner.isBot && !loser.isBot;
  const ratingDelta = rankedHumanMatch
    ? calculateRatingDelta(winner.ratingBefore, loser.ratingBefore)
    : 0;

  winner.ratingAfter = winner.ratingBefore + ratingDelta;
  loser.ratingAfter = loser.ratingBefore - ratingDelta;

  const endedAt = new Date();
  match.stats.durationSeconds = Math.round(
    (endedAt.getTime() - match.startedAt) / 1000
  );

  return {
    endedAt,
    endedBy,
    loser,
    match,
    persistedPlayers: [
      {
        side: "left",
        userId: match.players.left.userId,
        displayName: match.players.left.displayName,
        ratingBefore: match.players.left.ratingBefore,
        ratingAfter: match.players.left.ratingAfter,
        avatarUrl: match.players.left.avatarUrl ?? null,
        isBot: match.players.left.isBot ?? false
      },
      {
        side: "right",
        userId: match.players.right.userId,
        displayName: match.players.right.displayName,
        ratingBefore: match.players.right.ratingBefore,
        ratingAfter: match.players.right.ratingAfter,
        avatarUrl: match.players.right.avatarUrl ?? null,
        isBot: match.players.right.isBot ?? false
      }
    ],
    rankedHumanMatch,
    ratingDelta,
    summary: serializeMatchSummary(match, winnerSide, endedBy),
    winner
  };
}

export async function persistMatchFinalizationWithRetry(
  context: MatchFinalizationContext,
  options: PersistMatchFinalizationOptions
) {
  let lastError: unknown = null;
  let warnedAboutSequentialFallback = options.warnedAboutSequentialFallback;

  for (let attempt = 1; attempt <= MATCH_FINALIZATION_ATTEMPTS; attempt += 1) {
    try {
      warnedAboutSequentialFallback = await persistMatchFinalization(context, {
        ...options,
        warnedAboutSequentialFallback
      });
      return { warnedAboutSequentialFallback };
    } catch (error) {
      lastError = error;
      logger.warn(
        {
          attempt,
          err: error,
          matchId: context.match.id
        },
        "Failed to persist match finalization."
      );

      if (attempt < MATCH_FINALIZATION_ATTEMPTS) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, MATCH_FINALIZATION_RETRY_MS);
        });
      }
    }
  }

  throw lastError;
}

export function buildIntendedResultSnapshot(context: MatchFinalizationContext) {
  return {
    endedAt: context.endedAt.toISOString(),
    endedBy: context.endedBy,
    matchId: context.match.id,
    players: context.persistedPlayers,
    ratingDelta: context.ratingDelta,
    score: context.match.score,
    stats: {
      rallyCount: context.match.stats.rallyCount,
      longestRally: context.match.stats.longestRally,
      paddleHits: context.match.stats.paddleHits,
      maxBallSpeed: context.match.stats.maxBallSpeed,
      durationSeconds: context.match.stats.durationSeconds
    },
    winnerId: context.winner.userId
  };
}

export function buildFinalizationErrorPayload(
  matchId: string,
  finalizationErrorCode: string
): MatchFinalizationErrorPayload {
  return {
    matchId,
    error: finalizationErrorCode
  };
}

async function persistMatchFinalization(
  context: MatchFinalizationContext,
  options: PersistMatchFinalizationOptions
) {
  if (canUseTransactions()) {
    await mongoose.connection.transaction(async (session) => {
      await applyMatchFinalizationWrites(context, session);
    });
    return options.warnedAboutSequentialFallback;
  }

  if (!isProduction) {
    if (!options.warnedAboutSequentialFallback) {
      logger.warn(
        "MongoDB transactions are unavailable. Falling back to sequential match finalization writes outside production."
      );
    }

    await applyMatchFinalizationWrites(context);
    return true;
  }

  throw new Error(options.finalizationErrorCode);
}

async function applyMatchFinalizationWrites(
  context: MatchFinalizationContext,
  session?: mongoose.mongo.ClientSession
) {
  const sessionOptions = session ? { session } : undefined;

  if (context.rankedHumanMatch) {
    await UserModel.updateOne(
      { _id: context.winner.userId },
      {
        $set: { rating: context.winner.ratingAfter },
        $inc: { wins: 1, matchesPlayed: 1 }
      },
      sessionOptions
    );
    await UserModel.updateOne(
      { _id: context.loser.userId },
      {
        $set: { rating: context.loser.ratingAfter },
        $inc: { losses: 1, matchesPlayed: 1 }
      },
      sessionOptions
    );
  } else {
    if (!context.winner.isBot) {
      await UserModel.updateOne(
        { _id: context.winner.userId },
        { $inc: { wins: 1, matchesPlayed: 1 } },
        sessionOptions
      );
    }

    if (!context.loser.isBot) {
      await UserModel.updateOne(
        { _id: context.loser.userId },
        { $inc: { losses: 1, matchesPlayed: 1 } },
        sessionOptions
      );
    }
  }

  await MatchModel.findByIdAndUpdate(
    context.match.id,
    {
      $set: {
        status: "ended",
        score: context.match.score,
        winnerId: context.winner.userId,
        winnerName: context.winner.displayName,
        endedBy: context.endedBy,
        endedAt: context.endedAt,
        stats: {
          rallyCount: context.match.stats.rallyCount,
          longestRally: context.match.stats.longestRally,
          paddleHits: context.match.stats.paddleHits,
          maxBallSpeed: context.match.stats.maxBallSpeed,
          durationSeconds: context.match.stats.durationSeconds
        },
        replayFrames: context.match.replayFrames,
        players: context.persistedPlayers
      }
    },
    sessionOptions
  );
}
