// Socket handlers stay thin here so validation and rate limiting happen before the live service does any real work.
import type { Server as HttpServer } from "node:http";

import type { Express } from "express";
import type session from "express-session";
import { Server, type Socket } from "socket.io";

import {
  chatSendSchema,
  inputMoveSchema,
  type QueueStatusPayload,
  queueJoinSchema,
  resumeMatchSchema,
  roomJoinSchema,
  spectateJoinSchema
} from "@pingpong/shared";

import { config, isProduction } from "../config.js";
import { logger } from "../logger.js";
import { UserModel } from "../models/User.js";
import type { LiveMatchService } from "../services/liveMatchService.js";

type SessionMiddleware = ReturnType<typeof session>;
type SocketAck =
  | ((result: {
      ok: boolean;
      error?: string;
      status?: QueueStatusPayload;
    }) => void)
  | undefined;

const DEFAULT_RATE_LIMIT = { windowMs: 1000, limit: 12 };
const EVENT_RATE_LIMITS: Record<string, { windowMs: number; limit: number }> = {
  "chat:send": { windowMs: 3000, limit: 6 },
  "input:move": { windowMs: 1000, limit: 120 }
};

function wrapSession(middleware: SessionMiddleware) {
  return (socket: Socket, next: (error?: Error) => void) => {
    middleware(socket.request as never, {} as never, next as never);
  };
}

async function getSocketUser(socket: Socket) {
  const session = (
    socket.request as typeof socket.request & { session?: { userId?: string } }
  ).session;
  if (!session?.userId) {
    return null;
  }

  const user = await UserModel.findById(session.userId);
  if (!user) {
    return null;
  }

  return {
    userId: user._id.toString(),
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    rating: user.rating,
    provider: user.provider
  } as const;
}

export function initializeSocket(
  server: HttpServer,
  _app: Express,
  sessionMiddleware: SessionMiddleware,
  liveMatchService: LiveMatchService
) {
  const socketEventWindows = new Map<string, Map<string, number[]>>();

  function isRateLimited(socketId: string, eventName: string) {
    const configForEvent = EVENT_RATE_LIMITS[eventName] ?? DEFAULT_RATE_LIMIT;
    const now = Date.now();
    const perSocket =
      socketEventWindows.get(socketId) ?? new Map<string, number[]>();
    const recent = (perSocket.get(eventName) ?? []).filter(
      (stamp) => now - stamp < configForEvent.windowMs
    );

    if (recent.length >= configForEvent.limit) {
      perSocket.set(eventName, recent);
      socketEventWindows.set(socketId, perSocket);
      return true;
    }

    recent.push(now);
    perSocket.set(eventName, recent);
    socketEventWindows.set(socketId, perSocket);
    return false;
  }

  function rejectAck(callback: SocketAck, error: string) {
    callback?.({ ok: false, error });
  }

  const io = new Server(server, {
    cors: {
      origin: isProduction
        ? [config.CLIENT_URL]
        : [
            config.CLIENT_URL,
            /^http:\/\/localhost:\d+$/,
            /^http:\/\/127\.0\.0\.1:\d+$/
          ],
      credentials: true
    }
  });

  io.use(wrapSession(sessionMiddleware));
  liveMatchService.bind(io);

  io.on("connection", async (socket) => {
    const user = await getSocketUser(socket);
    if (!user) {
      socket.emit("error", { message: "Unauthorized" });
      socket.disconnect();
      return;
    }

    liveMatchService.registerSocket(socket, user);

    socket.on("queue:join", async (payload, callback) => {
      if (isRateLimited(socket.id, "queue:join")) {
        rejectAck(
          callback as SocketAck,
          "Too many requests. Slow down and try again."
        );
        return;
      }

      try {
        const parsed = queueJoinSchema.parse(payload);
        const status = await liveMatchService.joinQueue(
          socket,
          user,
          parsed.mode
        );
        callback?.({ ok: true, status });
      } catch (error) {
        callback?.({
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not join queue."
        });
      }
    });

    socket.on("queue:leave", (_payload, callback) => {
      if (isRateLimited(socket.id, "queue:leave")) {
        rejectAck(
          callback as SocketAck,
          "Too many requests. Slow down and try again."
        );
        return;
      }

      liveMatchService.leaveQueue(user.userId);
      callback?.({ ok: true });
    });

    socket.on("room:join", async (payload, callback) => {
      if (isRateLimited(socket.id, "room:join")) {
        rejectAck(
          callback as SocketAck,
          "Too many requests. Slow down and try again."
        );
        return;
      }

      try {
        const parsed = roomJoinSchema.parse(payload);
        const state = await liveMatchService.joinRoom(
          socket,
          user,
          parsed.code
        );
        callback?.({ ok: true, state });
      } catch (error) {
        callback?.({
          ok: false,
          error: error instanceof Error ? error.message : "Could not join room."
        });
      }
    });

    socket.on("match:resume", async (payload, callback) => {
      if (isRateLimited(socket.id, "match:resume")) {
        rejectAck(
          callback as SocketAck,
          "Too many requests. Slow down and try again."
        );
        return;
      }

      try {
        const parsed = resumeMatchSchema.parse(payload);
        const state = await liveMatchService.resumeMatch(
          socket,
          user,
          parsed.matchId
        );
        callback?.({ ok: true, state });
      } catch (error) {
        callback?.({
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not resume match."
        });
      }
    });

    socket.on("input:move", (payload, callback) => {
      if (isRateLimited(socket.id, "input:move")) {
        rejectAck(
          callback as SocketAck,
          "Too many movement updates. Slow down and try again."
        );
        return;
      }

      try {
        const parsed = inputMoveSchema.parse(payload);
        liveMatchService.handleInput(
          socket,
          user,
          parsed.matchId,
          parsed.position
        );
        callback?.({ ok: true });
      } catch (error) {
        callback?.({
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not process input."
        });
      }
    });

    socket.on("chat:send", async (payload, callback) => {
      if (isRateLimited(socket.id, "chat:send")) {
        rejectAck(
          callback as SocketAck,
          "Too many chat messages. Slow down and try again."
        );
        return;
      }

      try {
        const parsed = chatSendSchema.parse(payload);
        const message = await liveMatchService.handleChat(
          socket,
          user,
          parsed.matchId,
          parsed.body
        );
        callback?.({ ok: true, message });
      } catch (error) {
        callback?.({
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not send message."
        });
      }
    });

    socket.on("spectate:join", async (payload, callback) => {
      if (isRateLimited(socket.id, "spectate:join")) {
        rejectAck(
          callback as SocketAck,
          "Too many requests. Slow down and try again."
        );
        return;
      }

      try {
        const parsed = spectateJoinSchema.parse(payload);
        const state = await liveMatchService.spectate(socket, parsed.matchId);
        callback?.({ ok: true, state });
      } catch (error) {
        callback?.({
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not spectate match."
        });
      }
    });

    socket.on("disconnect", () => {
      socketEventWindows.delete(socket.id);
      void liveMatchService.handleDisconnect(socket.id);
      liveMatchService.unregisterSocket(socket.id);
    });
  });

  logger.info("Socket.IO initialized");
  return io;
}
