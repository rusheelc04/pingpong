export function updateClockOffset(
  currentOffsetMs: number | null,
  serverNowMs: number,
  receivedAtMs: number
) {
  const sampledOffsetMs = receivedAtMs - serverNowMs;

  if (currentOffsetMs === null) {
    return sampledOffsetMs;
  }

  return currentOffsetMs + (sampledOffsetMs - currentOffsetMs) * 0.2;
}

export function getEstimatedServerNowMs(
  clientNowMs: number,
  clockOffsetMs: number | null
) {
  return clockOffsetMs === null ? clientNowMs : clientNowMs - clockOffsetMs;
}
