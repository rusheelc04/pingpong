import type { CountdownPhase, MatchStatus } from "@pingpong/shared";

import { getEstimatedServerNowMs } from "./live-clock";

export const COUNTDOWN_BEAT_MS = 1000;
export const COUNTDOWN_GO_EXIT_MS = 280;

export type CountdownBeat = 3 | 2 | 1 | "GO";

export interface CountdownDisplayState {
  beat: CountdownBeat;
  beatKey: string;
  isExit: boolean;
  label: string;
  phase: CountdownPhase;
  sequenceKey: string;
}

function normalizePhase(phase?: CountdownPhase): CountdownPhase {
  return phase === "point-reset" ? "point-reset" : "opening-serve";
}

export function getCountdownLabel(phase?: CountdownPhase) {
  return normalizePhase(phase) === "point-reset"
    ? "Next serve"
    : "Match starts";
}

export function getCountdownSequenceKey(
  phase?: CountdownPhase,
  startsAt?: string
) {
  if (!startsAt) {
    return null;
  }

  return `${normalizePhase(phase)}:${startsAt}`;
}

export function getCountdownBeat(options: {
  clientNowMs: number;
  clockOffsetMs: number | null;
  startsAt?: string;
  status?: MatchStatus;
}): CountdownBeat | null {
  if (!options.startsAt || options.status !== "prestart") {
    return null;
  }

  const startsAtMs = Date.parse(options.startsAt);
  if (Number.isNaN(startsAtMs)) {
    return null;
  }

  const remainingMs =
    startsAtMs -
    getEstimatedServerNowMs(options.clientNowMs, options.clockOffsetMs);

  if (remainingMs <= 0) {
    return "GO";
  }

  return Math.min(3, Math.ceil(remainingMs / COUNTDOWN_BEAT_MS)) as 3 | 2 | 1;
}

export function createCountdownDisplayState(options: {
  beat: CountdownBeat;
  isExit?: boolean;
  phase?: CountdownPhase;
  sequenceKey: string;
}): CountdownDisplayState {
  const phase = normalizePhase(options.phase);
  const isExit = options.isExit ?? false;

  return {
    beat: options.beat,
    beatKey: `${options.sequenceKey}:${options.beat}:${isExit ? "exit" : "live"}`,
    isExit,
    label: getCountdownLabel(phase),
    phase,
    sequenceKey: options.sequenceKey
  };
}

export function getCountdownDisplayState(options: {
  clientNowMs: number;
  clockOffsetMs: number | null;
  countdownPhase?: CountdownPhase;
  startsAt?: string;
  status?: MatchStatus;
}) {
  const sequenceKey = getCountdownSequenceKey(
    options.countdownPhase,
    options.startsAt
  );
  const beat = getCountdownBeat(options);

  if (!sequenceKey || !beat) {
    return null;
  }

  return createCountdownDisplayState({
    beat,
    phase: options.countdownPhase,
    sequenceKey
  });
}
