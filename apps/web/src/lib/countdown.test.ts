import { describe, expect, it } from "vitest";

import { getCountdownValue } from "./countdown";

describe("getCountdownValue", () => {
  it("uses the server clock offset so countdowns do not skip on clock drift", () => {
    const startsAt = "2026-03-23T18:00:03.000Z";
    const clientNowMs = Date.parse("2026-03-23T18:00:01.100Z");
    const serverNowMs = Date.parse("2026-03-23T18:00:00.100Z");
    const clockOffsetMs = clientNowMs - serverNowMs;

    expect(
      getCountdownValue({
        clientNowMs,
        clockOffsetMs,
        startsAt,
        status: "prestart"
      })
    ).toBe(3);
  });

  it("drops the overlay as soon as authoritative live play begins", () => {
    expect(
      getCountdownValue({
        clientNowMs: Date.now(),
        clockOffsetMs: 0,
        startsAt: "2026-03-23T18:00:03.000Z",
        status: "live"
      })
    ).toBeNull();
  });
});
