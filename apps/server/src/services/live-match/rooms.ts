// Private rooms are just short-lived lobbies, so invite code rules and expiry live together here.
import { customAlphabet } from "nanoid";

import type { RoomInfo } from "@pingpong/shared";

import type { RoomLobby, SessionUserLike } from "./types.js";

const createRoomCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

export function prunePrivateRooms(
  privateRooms: Map<string, RoomLobby>,
  now = Date.now()
) {
  for (const [code, room] of privateRooms.entries()) {
    if (room.expiresAt <= now) {
      privateRooms.delete(code);
    }
  }
}

export function createPrivateRoom(
  privateRooms: Map<string, RoomLobby>,
  owner: SessionUserLike,
  ttlMs: number
): RoomInfo {
  prunePrivateRooms(privateRooms);

  for (const [code, room] of privateRooms.entries()) {
    if (room.owner.userId === owner.userId) {
      privateRooms.delete(code);
    }
  }

  const code = createRoomCode();
  privateRooms.set(code, {
    code,
    owner,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs
  });

  return {
    code,
    ownerId: owner.userId,
    createdAt: new Date().toISOString()
  };
}
