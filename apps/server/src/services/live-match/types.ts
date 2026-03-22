// These types describe the live in-memory shape of a match before it is flattened into API responses.
import type {
  BallState,
  CountdownPhase,
  MatchMode,
  MatchStats,
  MatchStatus,
  PlayerSide,
  PublicPlayer,
  ReplayFrame
} from "@pingpong/shared";

export interface SessionUserLike extends PublicPlayer {
  provider: "guest" | "github";
}

export interface LivePlayer extends PublicPlayer {
  side: PlayerSide;
  ratingBefore: number;
  ratingAfter: number;
  socketId?: string;
  paddleY: number;
  targetY: number;
  connected: boolean;
  lastSeenAt: number;
  disconnectDeadline?: number;
}

export interface LiveMatch {
  id: string;
  mode: MatchMode;
  ranked: boolean;
  roomCode?: string;
  players: Record<PlayerSide, LivePlayer>;
  score: {
    left: number;
    right: number;
  };
  ball: BallState;
  status: MatchStatus;
  resumeStatus?: "prestart" | "live";
  startedAt: number;
  startsAt?: number;
  countdownPhase?: CountdownPhase;
  lastReplayCaptureAt: number;
  replayFrames: ReplayFrame[];
  snapshotTick: number;
  spectators: Set<string>;
  stats: MatchStats & {
    currentRally: number;
  };
  interval?: NodeJS.Timeout;
}

export interface RoomLobby {
  code: string;
  owner: SessionUserLike;
  ownerSocketId?: string;
  createdAt: number;
  expiresAt: number;
}
