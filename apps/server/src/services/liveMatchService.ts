// This service coordinates queueing, simulation, reconnects, and persistence without leaking game rules into the route layer.
import { nanoid } from "nanoid";
import type { Server, Socket } from "socket.io";

import {
  type ChatMessage,
  type MatchEndedBy,
  type MatchMode,
  type PlayerSide,
  type QueueStatusPayload,
  GAME_CONSTANTS,
  clamp,
  createServe,
  sanitizeText,
  shouldWin,
  stepBall
} from "@pingpong/shared";

import { logger } from "../logger.js";
import { MessageModel } from "../models/Message.js";
import {
  buildFinalizationErrorPayload,
  buildIntendedResultSnapshot,
  persistMatchFinalizationWithRetry,
  prepareMatchFinalization,
  type MatchFinalizationContext
} from "./live-match/finalization.js";
import {
  CHAT_COOLDOWN_MS,
  MAX_PAUSE_MS,
  PAUSES_PER_PLAYER,
  PRIVATE_ROOM_DISCONNECT_GRACE_MS,
  PRIVATE_ROOM_SWEEP_MS,
  PRIVATE_ROOM_TTL_MS,
  RECONNECT_GRACE_MS,
  SNAPSHOT_EVERY_TICKS,
  TICK_MS
} from "./live-match/constants.js";
import {
  getQueueWindow,
  removeFromQueue,
  serializeQueueStatus
} from "./live-match/queue.js";
import { createPrivateRoom, prunePrivateRooms } from "./live-match/rooms.js";
import { serializeLiveState } from "./live-match/serialization.js";
import {
  advanceLivePaddle,
  captureReplayFrameIfDue,
  createPersistedLiveMatch,
  enterMatchPrestart
} from "./live-match/runtime.js";
import type {
  LiveMatch,
  LivePlayer,
  RoomLobby,
  SessionUserLike
} from "./live-match/types.js";

export const LIVE_MATCH_ERRORS = {
  alreadyInLiveMatch: "already-in-live-match",
  unauthorizedChatAccess: "unauthorized-chat-access",
  unauthorizedMatchAccess: "unauthorized-match-access",
  maintenanceOrDraining: "maintenance-or-draining",
  finalizationFailed: "match-finalization-failed"
} as const;

export class LiveMatchService {
  private io?: Server;
  private rankedQueue: Array<{
    userId: string;
    displayName: string;
    rating: number;
    enqueuedAt: number;
    socketId: string;
  }> = [];
  private liveMatches = new Map<string, LiveMatch>();
  private privateRooms = new Map<string, RoomLobby>();
  private socketUsers = new Map<string, SessionUserLike>();
  private socketToMatch = new Map<string, string>();
  private userToMatch = new Map<string, string>();
  private lastChatAt = new Map<string, number>();
  private roomCleanupTimer: NodeJS.Timeout;
  private acceptingNewMatches = true;
  private warnedAboutSequentialFinalizationFallback = false;

  constructor() {
    // Room codes expire on their own so we do not keep stale invite links around forever.
    this.roomCleanupTimer = setInterval(() => {
      prunePrivateRooms(this.privateRooms);
    }, PRIVATE_ROOM_SWEEP_MS);
    this.roomCleanupTimer.unref?.();
  }

  bind(io: Server) {
    this.io = io;
  }

  registerSocket(socket: Socket, user: SessionUserLike) {
    this.socketUsers.set(socket.id, user);
  }

  unregisterSocket(socketId: string) {
    this.socketUsers.delete(socketId);
    this.lastChatAt.delete(socketId);
  }

  getActiveMatchForUser(userId: string) {
    return this.userToMatch.get(userId) ?? null;
  }

  getMatchState(matchId: string) {
    const match = this.liveMatches.get(matchId);
    return match ? serializeLiveState(match) : null;
  }

  canUserAccessMatch(matchId: string, userId: string) {
    const match = this.liveMatches.get(matchId);
    if (!match) {
      return false;
    }

    return (
      match.players.left.userId === userId ||
      match.players.right.userId === userId
    );
  }

  isAcceptingNewMatches() {
    return this.acceptingNewMatches;
  }

  beginDrain() {
    this.acceptingNewMatches = false;
    this.rankedQueue = [];
    this.privateRooms.clear();
  }

  getDrainSnapshot() {
    return [...this.liveMatches.values()].map((match) => ({
      matchId: match.id,
      mode: match.mode,
      status: match.status,
      players: [match.players.left.displayName, match.players.right.displayName]
    }));
  }

  createPrivateRoom(owner: SessionUserLike) {
    this.assertCanStartNewMatch(owner.userId);
    this.leaveQueue(owner.userId);
    return createPrivateRoom(this.privateRooms, owner, PRIVATE_ROOM_TTL_MS);
  }

  async joinQueue(
    socket: Socket,
    user: SessionUserLike,
    mode: "ranked" | "practice"
  ): Promise<QueueStatusPayload> {
    this.assertCanStartNewMatch(user.userId);
    this.rankedQueue = removeFromQueue(this.rankedQueue, user.userId);

    if (mode === "practice") {
      const match = await this.createMatch({
        mode: "practice",
        ranked: false,
        left: { ...user, side: "left", socketId: socket.id, isBot: false },
        right: {
          userId: `bot-${nanoid(4)}`,
          displayName: "Arcade Bot",
          rating: 1200,
          provider: "guest",
          avatarUrl: null,
          side: "right",
          isBot: true
        }
      });

      this.emitMatchFound(match);
      return serializeLiveState(match);
    }

    const ticket = {
      userId: user.userId,
      displayName: user.displayName,
      rating: user.rating,
      enqueuedAt: Date.now(),
      socketId: socket.id
    };

    const opponentIndex = this.rankedQueue.findIndex((queued) => {
      const windowA = getQueueWindow(ticket.enqueuedAt);
      const windowB = getQueueWindow(queued.enqueuedAt);

      return (
        Math.abs(queued.rating - ticket.rating) <= Math.min(windowA, windowB)
      );
    });

    if (opponentIndex === -1) {
      this.rankedQueue.push(ticket);
      const payload = serializeQueueStatus(this.rankedQueue, ticket);
      socket.emit("queue:status", payload);
      return payload;
    }

    const [opponent] = this.rankedQueue.splice(opponentIndex, 1);
    const opponentUser = this.socketUsers.get(opponent.socketId);

    if (!opponentUser) {
      return this.joinQueue(socket, user, "ranked");
    }

    if (this.userToMatch.has(opponent.userId)) {
      return this.joinQueue(socket, user, "ranked");
    }

    const match = await this.createMatch({
      mode: "ranked",
      ranked: true,
      left: {
        ...opponentUser,
        side: "left",
        socketId: opponent.socketId,
        isBot: false
      },
      right: { ...user, side: "right", socketId: socket.id, isBot: false }
    });

    this.emitMatchFound(match);
    return serializeLiveState(match);
  }

  leaveQueue(userId: string) {
    this.rankedQueue = removeFromQueue(this.rankedQueue, userId);
  }

  async joinRoom(socket: Socket, user: SessionUserLike, code: string) {
    this.assertAcceptingNewMatches();
    prunePrivateRooms(this.privateRooms);

    if (this.userToMatch.has(user.userId)) {
      throw new Error(LIVE_MATCH_ERRORS.alreadyInLiveMatch);
    }

    this.leaveQueue(user.userId);

    const room = this.privateRooms.get(code);
    if (!room) {
      throw new Error("Room not found.");
    }

    if (room.owner.userId === user.userId) {
      room.ownerSocketId = socket.id;
      room.expiresAt = Date.now() + PRIVATE_ROOM_TTL_MS;
      socket.emit("queue:status", {
        state: "waiting-room",
        roomCode: code
      });
      return null;
    }

    this.privateRooms.delete(code);
    const match = await this.createMatch({
      mode: "private",
      ranked: false,
      roomCode: code,
      left: {
        ...room.owner,
        side: "left",
        socketId: room.ownerSocketId,
        isBot: false
      },
      right: {
        ...user,
        side: "right",
        socketId: socket.id,
        isBot: false
      }
    });

    this.emitMatchFound(match);
    return serializeLiveState(match);
  }

  async resumeMatch(socket: Socket, user: SessionUserLike, matchId: string) {
    const match = this.liveMatches.get(matchId);
    if (!match) {
      throw new Error("Match is no longer live.");
    }

    const player = [match.players.left, match.players.right].find(
      (entry) => entry.userId === user.userId
    );
    if (player) {
      const currentMatchId = this.userToMatch.get(user.userId);
      if (currentMatchId && currentMatchId !== match.id) {
        throw new Error(LIVE_MATCH_ERRORS.alreadyInLiveMatch);
      }

      if (player.socketId && player.socketId !== socket.id) {
        this.socketToMatch.delete(player.socketId);
      }

      player.socketId = socket.id;
      player.connected = true;
      player.disconnectDeadline = undefined;
      player.lastSeenAt = Date.now();
      this.socketToMatch.set(socket.id, match.id);
      this.userToMatch.set(user.userId, match.id);

      if (
        !match.players.left.disconnectDeadline &&
        !match.players.right.disconnectDeadline
      ) {
        match.status = match.resumeStatus ?? "live";
        match.resumeStatus = undefined;
      }

      socket.join(match.id);
      this.emitPresence(match);
      this.emitSnapshot(match, true);
      return serializeLiveState(match);
    }

    throw new Error(LIVE_MATCH_ERRORS.unauthorizedMatchAccess);
  }

  handleInput(
    socket: Socket,
    user: SessionUserLike,
    matchId: string,
    position: number
  ) {
    const match = this.liveMatches.get(matchId);
    if (!match) {
      throw new Error("Match not found.");
    }

    const player = [match.players.left, match.players.right].find(
      (entry) => entry.userId === user.userId
    );
    if (!player || player.socketId !== socket.id) {
      throw new Error("You are not controlling this match.");
    }

    if (match.status !== "live") {
      return;
    }

    // The socket schema clamps the normalized value, and we clamp the derived board coordinate here too.
    player.targetY = clamp(
      position * (GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight),
      0,
      GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight
    );
  }

  async handleChat(
    socket: Socket,
    user: SessionUserLike,
    matchId: string,
    rawBody: string
  ) {
    const match = this.liveMatches.get(matchId);
    if (!match) {
      throw new Error("Match not found.");
    }

    const player = [match.players.left, match.players.right].find(
      (entry) => entry.userId === user.userId && entry.socketId === socket.id
    );
    if (!player) {
      throw new Error(LIVE_MATCH_ERRORS.unauthorizedChatAccess);
    }

    const lastMessageAt = this.lastChatAt.get(socket.id) ?? 0;
    if (Date.now() - lastMessageAt < CHAT_COOLDOWN_MS) {
      throw new Error("You are sending messages too quickly.");
    }

    const body = sanitizeText(rawBody);
    if (!body) {
      throw new Error("Message cannot be empty.");
    }

    this.lastChatAt.set(socket.id, Date.now());
    const doc = await MessageModel.create({
      matchId,
      senderId: user.userId,
      senderName: user.displayName,
      body
    });

    const message: ChatMessage = {
      id: doc._id.toString(),
      matchId,
      senderId: user.userId,
      senderName: user.displayName,
      body,
      createdAt: doc.createdAt.toISOString()
    };

    this.io?.to(matchId).emit("chat:message", message);
    return message;
  }

  handlePauseToggle(socket: Socket, user: SessionUserLike, matchId: string) {
    const match = this.liveMatches.get(matchId);
    if (!match) {
      throw new Error("Match not found.");
    }

    if (match.ranked) {
      throw new Error("Cannot pause a ranked match.");
    }

    const player = [match.players.left, match.players.right].find(
      (entry) => entry.userId === user.userId
    );
    if (!player) {
      throw new Error("Only players can pause.");
    }

    // If already manually paused, treat as unpause
    if (match.manualPause) {
      match.manualPause = undefined;
      match.status = match.resumeStatus ?? "live";
      match.resumeStatus = undefined;
      this.emitSnapshot(match, true);
      return;
    }

    if (match.status !== "live" && match.status !== "prestart") {
      throw new Error("Cannot pause in current state.");
    }

    const usedKey = player.side;
    if ((match.pausesUsed[usedKey] ?? 0) >= PAUSES_PER_PLAYER) {
      throw new Error("No pauses remaining.");
    }

    match.pausesUsed[usedKey] = (match.pausesUsed[usedKey] ?? 0) + 1;
    match.resumeStatus = match.status === "prestart" ? "prestart" : "live";
    match.status = "paused";
    match.manualPause = {
      pausedBy: user.userId,
      pausedByName: user.displayName,
      resumesAt: Date.now() + MAX_PAUSE_MS
    };
    this.emitSnapshot(match, true);
  }

  async handleDisconnect(socketId: string) {
    prunePrivateRooms(this.privateRooms);

    const user = this.socketUsers.get(socketId);
    const matchId = this.socketToMatch.get(socketId);

    if (user) {
      this.rankedQueue = removeFromQueue(this.rankedQueue, user.userId);

      const ownedRoom = [...this.privateRooms.values()].find(
        (entry) => entry.owner.userId === user.userId
      );
      if (ownedRoom && ownedRoom.ownerSocketId === socketId) {
        ownedRoom.ownerSocketId = undefined;
        ownedRoom.expiresAt = Math.min(
          ownedRoom.expiresAt,
          Date.now() + PRIVATE_ROOM_DISCONNECT_GRACE_MS
        );
      }
    }

    if (matchId) {
      const match = this.liveMatches.get(matchId);
      if (match) {
        const player = [match.players.left, match.players.right].find(
          (entry) => entry.socketId === socketId
        );
        if (player) {
          player.connected = false;
          player.socketId = undefined;
          player.disconnectDeadline = Date.now() + RECONNECT_GRACE_MS;
          match.resumeStatus =
            match.status === "prestart" ? "prestart" : "live";
          match.status = "paused";
          this.emitPresence(match);
          this.io?.to(match.id).emit("match:reconnect-window", {
            matchId: match.id,
            reconnectDeadline: new Date(
              player.disconnectDeadline
            ).toISOString(),
            playerId: player.userId
          });
        }
      }

      this.socketToMatch.delete(socketId);
    }
  }

  dispose() {
    clearInterval(this.roomCleanupTimer);

    for (const match of this.liveMatches.values()) {
      if (match.interval) {
        clearInterval(match.interval);
      }
    }

    this.liveMatches.clear();
    this.privateRooms.clear();
    this.rankedQueue = [];
    this.socketUsers.clear();
    this.socketToMatch.clear();
    this.userToMatch.clear();
    this.lastChatAt.clear();
  }

  private assertAcceptingNewMatches() {
    if (!this.acceptingNewMatches) {
      throw new Error(LIVE_MATCH_ERRORS.maintenanceOrDraining);
    }
  }

  private assertCanStartNewMatch(userId: string) {
    this.assertAcceptingNewMatches();

    if (this.userToMatch.has(userId)) {
      throw new Error(LIVE_MATCH_ERRORS.alreadyInLiveMatch);
    }
  }

  private emitMatchFound(match: LiveMatch) {
    this.emitToPlayer(match.players.left, "match:found", {
      matchId: match.id,
      mode: match.mode,
      roomCode: match.roomCode,
      opponent: match.players.right.displayName
    });
    this.emitToPlayer(match.players.right, "match:found", {
      matchId: match.id,
      mode: match.mode,
      roomCode: match.roomCode,
      opponent: match.players.left.displayName
    });
    this.emitSnapshot(match, true);
  }

  private joinSocketToMatchRoom(socketId: string | undefined, matchId: string) {
    if (!socketId) {
      return;
    }

    const socket = this.io?.sockets.sockets.get(socketId);
    socket?.join(matchId);
  }

  private async createMatch(options: {
    mode: MatchMode;
    ranked: boolean;
    roomCode?: string;
    left: SessionUserLike & {
      side: PlayerSide;
      socketId?: string;
      isBot?: boolean;
    };
    right: SessionUserLike & {
      side: PlayerSide;
      socketId?: string;
      isBot?: boolean;
    };
  }) {
    const match = await createPersistedLiveMatch(options);

    this.liveMatches.set(match.id, match);
    this.userToMatch.set(match.players.left.userId, match.id);
    this.userToMatch.set(match.players.right.userId, match.id);

    if (match.players.left.socketId) {
      this.socketToMatch.set(match.players.left.socketId, match.id);
      this.joinSocketToMatchRoom(match.players.left.socketId, match.id);
    }

    if (match.players.right.socketId) {
      this.socketToMatch.set(match.players.right.socketId, match.id);
      this.joinSocketToMatchRoom(match.players.right.socketId, match.id);
    }

    match.interval = setInterval(() => {
      void this.tickMatch(match.id);
    }, TICK_MS);

    return match;
  }

  private async tickMatch(matchId: string) {
    const match = this.liveMatches.get(matchId);
    if (!match || match.status === "ended") {
      return;
    }

    if (match.status === "paused") {
      // Manual pause auto-resumes when the timer expires
      if (match.manualPause && match.manualPause.resumesAt <= Date.now()) {
        match.manualPause = undefined;
        match.status = match.resumeStatus ?? "live";
        match.resumeStatus = undefined;
        this.emitSnapshot(match, true);
        return;
      }

      const disconnectedPlayer = [match.players.left, match.players.right].find(
        (player) =>
          player.disconnectDeadline && player.disconnectDeadline <= Date.now()
      );

      if (disconnectedPlayer) {
        const winnerSide: PlayerSide =
          disconnectedPlayer.side === "left" ? "right" : "left";
        await this.finishMatch(match, winnerSide, "forfeit");
      }

      return;
    }

    if (match.status === "prestart") {
      if ((match.startsAt ?? 0) > Date.now()) {
        return;
      }

      match.status = "live";
      match.startsAt = undefined;
      match.countdownPhase = undefined;
      this.emitSnapshot(match);
      return;
    }

    advanceLivePaddle(match.players.left, match);
    advanceLivePaddle(match.players.right, match);

    const step = stepBall({
      ball: match.ball,
      leftPaddleY: match.players.left.paddleY,
      rightPaddleY: match.players.right.paddleY
    });

    match.ball = step.ball;
    const speed = Math.hypot(match.ball.vx, match.ball.vy);
    match.stats.maxBallSpeed = Math.max(match.stats.maxBallSpeed, speed);

    if (step.paddleHit) {
      match.stats.paddleHits += 1;
      match.stats.currentRally += 1;
      match.stats.longestRally = Math.max(
        match.stats.longestRally,
        match.stats.currentRally
      );
    }

    if (step.scoredOn === "left") {
      match.score.right += 1;
      match.stats.rallyCount += 1;
      match.stats.currentRally = 0;
      match.ball = createServe();
    } else if (step.scoredOn === "right") {
      match.score.left += 1;
      match.stats.rallyCount += 1;
      match.stats.currentRally = 0;
      match.ball = createServe();
    }

    if (step.scoredOn && shouldWin(match.score)) {
      const winnerSide: PlayerSide =
        match.score.left > match.score.right ? "left" : "right";
      await this.finishMatch(match, winnerSide, "score");
      return;
    }

    if (step.scoredOn) {
      enterMatchPrestart(match, "point-reset", GAME_CONSTANTS.scorePauseMs);
      this.emitSnapshot(match);
    }

    captureReplayFrameIfDue(match);

    match.snapshotTick += 1;
    if (match.snapshotTick % SNAPSHOT_EVERY_TICKS === 0) {
      this.emitSnapshot(match);
    }
  }

  private async finishMatch(
    match: LiveMatch,
    winnerSide: PlayerSide,
    endedBy: MatchEndedBy
  ) {
    if (match.status === "ended") {
      return;
    }

    match.status = "ended";
    match.resumeStatus = undefined;
    match.startsAt = undefined;
    match.countdownPhase = undefined;
    if (match.interval) {
      clearInterval(match.interval);
    }

    const context = this.prepareMatchFinalization(match, winnerSide, endedBy);

    try {
      const finalizationResult = await persistMatchFinalizationWithRetry(
        context,
        {
          finalizationErrorCode: LIVE_MATCH_ERRORS.finalizationFailed,
          warnedAboutSequentialFallback:
            this.warnedAboutSequentialFinalizationFallback
        }
      );
      this.warnedAboutSequentialFinalizationFallback =
        finalizationResult.warnedAboutSequentialFallback;
      this.io?.to(match.id).emit("match:end", {
        summary: context.summary,
        ratingDelta: context.ratingDelta
      });
      this.releaseMatchOwnership(match);
      this.scheduleLiveMatchCleanup(match.id);
    } catch (error) {
      this.handleMatchFinalizationFailure(context, error);
    }
  }

  private prepareMatchFinalization(
    match: LiveMatch,
    winnerSide: PlayerSide,
    endedBy: MatchEndedBy
  ): MatchFinalizationContext {
    return prepareMatchFinalization(match, winnerSide, endedBy);
  }

  private handleMatchFinalizationFailure(
    context: MatchFinalizationContext,
    error: unknown
  ) {
    logger.error(
      {
        err: error,
        intendedResult: buildIntendedResultSnapshot(context)
      },
      "Could not safely persist the finished match."
    );

    const payload = buildFinalizationErrorPayload(
      context.match.id,
      LIVE_MATCH_ERRORS.finalizationFailed
    );

    this.io?.to(context.match.id).emit("match:finalization-error", payload);
    this.releaseMatchOwnership(context.match);
    this.liveMatches.delete(context.match.id);
  }

  private releaseMatchOwnership(match: LiveMatch) {
    this.userToMatch.delete(match.players.left.userId);
    this.userToMatch.delete(match.players.right.userId);

    if (match.players.left.socketId) {
      this.socketToMatch.delete(match.players.left.socketId);
    }

    if (match.players.right.socketId) {
      this.socketToMatch.delete(match.players.right.socketId);
    }
  }

  private scheduleLiveMatchCleanup(matchId: string, delayMs = 5_000) {
    const cleanupTimeout = setTimeout(() => {
      this.liveMatches.delete(matchId);
    }, delayMs);
    cleanupTimeout.unref?.();
  }

  private emitSnapshot(match: LiveMatch, includeStart = false) {
    const state = serializeLiveState(match);
    this.io
      ?.to(match.id)
      .emit(includeStart ? "match:start" : "state:snapshot", state);
  }

  private emitPresence(match: LiveMatch) {
    this.io?.to(match.id).emit("presence:update", {
      matchId: match.id,
      players: {
        left: {
          userId: match.players.left.userId,
          connected: match.players.left.connected
        },
        right: {
          userId: match.players.right.userId,
          connected: match.players.right.connected
        }
      }
    });
  }

  private emitToPlayer(player: LivePlayer, event: string, payload: unknown) {
    if (player.socketId) {
      this.io?.to(player.socketId).emit(event, payload);
    }
  }
}
