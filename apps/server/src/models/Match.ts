// Matches store the final record plus enough replay data to retell a game after the socket room is gone.
import mongoose from "mongoose";

import type {
  MatchMode,
  MatchStats,
  PersistedMatchStatus,
  PlayerSide
} from "@pingpong/shared";

interface MatchPlayer {
  side: PlayerSide;
  userId: string;
  displayName: string;
  ratingBefore: number;
  ratingAfter: number;
  avatarUrl?: string | null;
  isBot?: boolean;
}

export interface MatchDocument extends mongoose.Document {
  mode: MatchMode;
  ranked: boolean;
  status: PersistedMatchStatus;
  roomCode?: string;
  players: MatchPlayer[];
  score: {
    left: number;
    right: number;
  };
  winnerId?: string | null;
  winnerName?: string | null;
  endedBy: "score" | "forfeit";
  startedAt: Date;
  endedAt?: Date;
  stats: MatchStats;
  replayFrames: Array<{
    t: number;
    ball: { x: number; y: number };
    paddles: { left: number; right: number };
    score: { left: number; right: number };
  }>;
}

const matchSchema = new mongoose.Schema<MatchDocument>({
  mode: {
    type: String,
    enum: ["ranked", "private", "practice"],
    required: true
  },
  ranked: { type: Boolean, required: true },
  status: {
    type: String,
    enum: ["live", "ended"],
    default: "live",
    index: true
  },
  roomCode: { type: String, default: null, index: true },
  players: [
    {
      side: { type: String, enum: ["left", "right"], required: true },
      userId: { type: String, required: true },
      displayName: { type: String, required: true },
      ratingBefore: { type: Number, required: true },
      ratingAfter: { type: Number, required: true },
      avatarUrl: { type: String, default: null },
      isBot: { type: Boolean, default: false }
    }
  ],
  score: {
    left: { type: Number, default: 0 },
    right: { type: Number, default: 0 }
  },
  winnerId: { type: String, default: null },
  winnerName: { type: String, default: null },
  endedBy: { type: String, enum: ["score", "forfeit"], default: "score" },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  stats: {
    rallyCount: { type: Number, default: 0 },
    longestRally: { type: Number, default: 0 },
    paddleHits: { type: Number, default: 0 },
    maxBallSpeed: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 }
  },
  replayFrames: [
    {
      t: { type: Number, required: true },
      ball: {
        x: { type: Number, required: true },
        y: { type: Number, required: true }
      },
      paddles: {
        left: { type: Number, required: true },
        right: { type: Number, required: true }
      },
      score: {
        left: { type: Number, required: true },
        right: { type: Number, required: true }
      }
    }
  ]
});

matchSchema.index({ "players.userId": 1, status: 1, endedAt: -1 });

export const MatchModel =
  mongoose.models.Match || mongoose.model<MatchDocument>("Match", matchSchema);
