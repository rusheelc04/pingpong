import type { MatchStatus } from "@pingpong/shared";

import { getEstimatedServerNowMs } from "./live-clock";

export function getCountdownValue(options: {
  clientNowMs: number;
  clockOffsetMs: number | null;
  startsAt?: string;
  status?: MatchStatus;
}) {
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
    return 0;
  }

  return Math.ceil(remainingMs / 1000);
}
