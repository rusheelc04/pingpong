// Shared types and helpers live here so the web and server talk about matches with the same vocabulary.
import { z } from "zod";

// These values tune the match feel for the current board size and replay cadence.
export const GAME_CONSTANTS = {
  boardWidth: 1000,
  boardHeight: 600,
  paddleWidth: 18,
  paddleHeight: 120,
  paddleSpeed: 18,
  simulationTickMs: 1000 / 60,
  ballRadius: 10,
  serveSpeed: 8,
  maxBallSpeed: 16,
  leftPaddleX: 42,
  rightPaddleX: 1000 - 42 - 18,
  winScore: 11,
  winBy: 2,
  replayCaptureMs: 33,
  matchIntroMs: 3000,
  scorePauseMs: 3000
} as const;

export type MatchMode = "ranked" | "private" | "practice";
export type MatchStatus = "prestart" | "live" | "paused" | "ended";
export type PersistedMatchStatus = "live" | "ended";
export type MatchEndedBy = "score" | "forfeit";
export type PlayerSide = "left" | "right";
export type CountdownPhase = "opening-serve" | "point-reset";

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface ScoreState {
  left: number;
  right: number;
}

export interface PublicPlayer {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  rating: number;
  isBot?: boolean;
}

export interface SessionUser extends PublicPlayer {
  provider: "guest";
}

export interface QueueTicket {
  userId: string;
  displayName: string;
  rating: number;
  enqueuedAt: number;
  socketId: string;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface MatchStats {
  rallyCount: number;
  longestRally: number;
  paddleHits: number;
  maxBallSpeed: number;
  durationSeconds: number;
}

export interface MatchPlayerSummary {
  side: PlayerSide;
  userId: string;
  displayName: string;
  ratingBefore: number;
  ratingAfter: number;
  avatarUrl?: string | null;
  isBot?: boolean;
}

export interface ReplayFrame {
  t: number;
  ball: Pick<BallState, "x" | "y">;
  paddles: ScoreState;
  score: ScoreState;
}

export interface ReplayTimeline {
  matchId: string;
  frames: ReplayFrame[];
  score: ScoreState;
  winnerId?: string | null;
  winnerName?: string | null;
  stats: MatchStats;
  captureMs: number;
}

export interface RoomInfo {
  code: string;
  ownerId: string;
  createdAt: string;
}

export interface PauseState {
  pausedBy: string;
  pausedByName: string;
  resumesAt: string;
}

export interface LiveMatchState {
  matchId: string;
  mode: MatchMode;
  ranked: boolean;
  status: MatchStatus;
  roomCode?: string;
  players: {
    left: PublicPlayer;
    right: PublicPlayer;
  };
  paddles: ScoreState;
  ball: BallState;
  score: ScoreState;
  startedAt: string;
  startsAt?: string;
  countdownPhase?: CountdownPhase;
  reconnectDeadline?: string;
  pauseInfo?: PauseState;
  pausesLeft?: { left: number; right: number };
  serverNowMs: number;
}

export interface CompletedMatchSummary {
  id: string;
  mode: MatchMode;
  ranked: boolean;
  roomCode?: string;
  status: "ended";
  score: ScoreState;
  players: MatchPlayerSummary[];
  winnerId?: string | null;
  winnerName?: string | null;
  endedBy: MatchEndedBy;
  startedAt: string;
  endedAt: string;
  stats: MatchStats;
  replayAvailable: boolean;
  isLive: false;
}

export type MatchSummary = CompletedMatchSummary;

export interface QueueSearchingStatus {
  state: "searching";
  queuePosition: number;
  waitMs: number;
  ratingWindow: number;
}

export interface WaitingRoomStatus {
  state: "waiting-room";
  roomCode: string;
}

export type QueueStatusPayload =
  | LiveMatchState
  | QueueSearchingStatus
  | WaitingRoomStatus
  | null;

export interface PresenceUpdatePayload {
  matchId: string;
  players: {
    left: {
      userId: string;
      connected: boolean;
    };
    right: {
      userId: string;
      connected: boolean;
    };
  };
}

export interface MatchReconnectWindowPayload {
  matchId: string;
  reconnectDeadline: string;
  playerId: string;
}

export interface MatchFinalizationErrorPayload {
  matchId: string;
  error: string;
}

export const guestSessionSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .max(24, "Display name must be 24 characters or fewer.")
    .regex(
      /^[A-Za-z0-9 _-]+$/,
      "Display name can only use letters, numbers, spaces, hyphens, and underscores."
    )
});

export const queueJoinSchema = z.object({
  mode: z.enum(["ranked", "practice"])
});

export const roomJoinSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(12)
    .regex(/^[A-Z0-9]+$/)
});

export const resumeMatchSchema = z.object({
  matchId: z.string().trim().min(1)
});

export const inputMoveSchema = z.object({
  matchId: z.string().trim().min(1),
  position: z.number().min(0).max(1)
});

export const chatSendSchema = z.object({
  matchId: z.string().trim().min(1),
  body: z.string().trim().min(1).max(240)
});

export const pauseToggleSchema = z.object({
  matchId: z.string().trim().min(1)
});

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Chat keeps server sanitization as the source of truth, but we reuse this anywhere text crosses a boundary.
export function sanitizeText(value: string) {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
}

// Serves start in the middle with a slight angle so early rallies do not feel scripted.
export function createServe(random = Math.random): BallState {
  const direction = random() > 0.5 ? 1 : -1;
  const angle = (random() - 0.5) * 4;
  return {
    x: GAME_CONSTANTS.boardWidth / 2,
    y: GAME_CONSTANTS.boardHeight / 2,
    vx: GAME_CONSTANTS.serveSpeed * direction,
    vy: angle
  };
}

// Win-by-two keeps close games alive a little longer and makes late points matter.
export function shouldWin(score: ScoreState) {
  return (
    (score.left >= GAME_CONSTANTS.winScore ||
      score.right >= GAME_CONSTANTS.winScore) &&
    Math.abs(score.left - score.right) >= GAME_CONSTANTS.winBy
  );
}

export function calculateExpectedScore(
  playerRating: number,
  opponentRating: number
) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

export function calculateRatingDelta(
  winnerRating: number,
  loserRating: number,
  kFactor = 32
) {
  const expectedWinner = calculateExpectedScore(winnerRating, loserRating);
  return Math.round(kFactor * (1 - expectedWinner));
}

export interface StepBallOptions {
  ball: BallState;
  leftPaddleY: number;
  rightPaddleY: number;
}

export interface StepBallResult {
  ball: BallState;
  scoredOn?: PlayerSide;
  wallHit: boolean;
  paddleHit: boolean;
}

// The server advances the ball one step at a time so the web client only has to paint snapshots.
export function stepBall({
  ball,
  leftPaddleY,
  rightPaddleY
}: StepBallOptions): StepBallResult {
  let next: BallState = {
    x: ball.x + ball.vx,
    y: ball.y + ball.vy,
    vx: ball.vx,
    vy: ball.vy
  };
  let wallHit = false;
  let paddleHit = false;

  if (
    next.y <= GAME_CONSTANTS.ballRadius ||
    next.y >= GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.ballRadius
  ) {
    next = {
      ...next,
      y: clamp(
        next.y,
        GAME_CONSTANTS.ballRadius,
        GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.ballRadius
      ),
      vy: -next.vy
    };
    wallHit = true;
  }

  const leftBounds = {
    x: GAME_CONSTANTS.leftPaddleX + GAME_CONSTANTS.paddleWidth,
    top: leftPaddleY,
    bottom: leftPaddleY + GAME_CONSTANTS.paddleHeight
  };
  const rightBounds = {
    x: GAME_CONSTANTS.rightPaddleX,
    top: rightPaddleY,
    bottom: rightPaddleY + GAME_CONSTANTS.paddleHeight
  };

  if (
    next.vx < 0 &&
    next.x - GAME_CONSTANTS.ballRadius <= leftBounds.x &&
    next.y >= leftBounds.top &&
    next.y <= leftBounds.bottom
  ) {
    const offset =
      (next.y - (leftPaddleY + GAME_CONSTANTS.paddleHeight / 2)) /
      (GAME_CONSTANTS.paddleHeight / 2);
    const speed = clamp(
      Math.abs(next.vx) * 1.03,
      GAME_CONSTANTS.serveSpeed,
      GAME_CONSTANTS.maxBallSpeed
    );
    next = {
      ...next,
      x: leftBounds.x + GAME_CONSTANTS.ballRadius,
      vx: speed,
      vy: clamp(
        next.vy + offset * 2.4,
        -GAME_CONSTANTS.maxBallSpeed,
        GAME_CONSTANTS.maxBallSpeed
      )
    };
    paddleHit = true;
  }

  if (
    next.vx > 0 &&
    next.x + GAME_CONSTANTS.ballRadius >= rightBounds.x &&
    next.y >= rightBounds.top &&
    next.y <= rightBounds.bottom
  ) {
    const offset =
      (next.y - (rightPaddleY + GAME_CONSTANTS.paddleHeight / 2)) /
      (GAME_CONSTANTS.paddleHeight / 2);
    const speed = clamp(
      Math.abs(next.vx) * 1.03,
      GAME_CONSTANTS.serveSpeed,
      GAME_CONSTANTS.maxBallSpeed
    );
    next = {
      ...next,
      x: rightBounds.x - GAME_CONSTANTS.ballRadius,
      vx: -speed,
      vy: clamp(
        next.vy + offset * 2.4,
        -GAME_CONSTANTS.maxBallSpeed,
        GAME_CONSTANTS.maxBallSpeed
      )
    };
    paddleHit = true;
  }

  if (next.x < -GAME_CONSTANTS.ballRadius) {
    return { ball: next, scoredOn: "left", wallHit, paddleHit };
  }

  if (next.x > GAME_CONSTANTS.boardWidth + GAME_CONSTANTS.ballRadius) {
    return { ball: next, scoredOn: "right", wallHit, paddleHit };
  }

  return { ball: next, wallHit, paddleHit };
}
