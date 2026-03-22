// These timings are shared across queueing, reconnects, and the live match loop.
export const TICK_MS = 1000 / 60;
export const SNAPSHOT_EVERY_TICKS = 2;
export const RECONNECT_GRACE_MS = 20_000;
export const CHAT_COOLDOWN_MS = 750;
export const PRIVATE_ROOM_TTL_MS = 15 * 60_000;
export const PRIVATE_ROOM_DISCONNECT_GRACE_MS = 5 * 60_000;
export const PRIVATE_ROOM_SWEEP_MS = 60_000;
export const MAX_PAUSE_MS = 60_000;
export const PAUSES_PER_PLAYER = 2;
