import { describe, expect, it } from "vitest";

import {
  createCountdownDisplayState,
  getCountdownBeat,
  getCountdownDisplayState,
  getCountdownSequenceKey
} from "./countdown";

describe("countdown helpers", () => {
  it("uses the server clock offset so countdowns do not skip on clock drift", () => {
    const startsAt = "2026-03-23T18:00:03.000Z";
    const clientNowMs = Date.parse("2026-03-23T18:00:01.100Z");
    const serverNowMs = Date.parse("2026-03-23T18:00:00.100Z");
    const clockOffsetMs = clientNowMs - serverNowMs;

    expect(
      getCountdownBeat({
        clientNowMs: clientNowMs - 25,
        clockOffsetMs,
        startsAt,
        status: "prestart"
      })
    ).toBe(3);
    expect(
      getCountdownBeat({
        clientNowMs,
        clockOffsetMs,
        startsAt,
        status: "prestart"
      })
    ).toBe(3);
    expect(
      getCountdownBeat({
        clientNowMs: clientNowMs + 1_000,
        clockOffsetMs,
        startsAt,
        status: "prestart"
      })
    ).toBe(2);
    expect(
      getCountdownBeat({
        clientNowMs: clientNowMs + 2_000,
        clockOffsetMs,
        startsAt,
        status: "prestart"
      })
    ).toBe(1);
    expect(
      getCountdownBeat({
        clientNowMs: clientNowMs + 3_050,
        clockOffsetMs,
        startsAt,
        status: "prestart"
      })
    ).toBe("GO");
  });

  it("keeps the same sequence key for repeated snapshots and changes it for a new serve", () => {
    const first = getCountdownDisplayState({
      clientNowMs: Date.parse("2026-03-23T18:00:00.000Z"),
      clockOffsetMs: 0,
      countdownPhase: "point-reset",
      startsAt: "2026-03-23T18:00:03.000Z",
      status: "prestart"
    });
    const repeated = getCountdownDisplayState({
      clientNowMs: Date.parse("2026-03-23T18:00:00.050Z"),
      clockOffsetMs: 0,
      countdownPhase: "point-reset",
      startsAt: "2026-03-23T18:00:03.000Z",
      status: "prestart"
    });
    const nextServe = getCountdownDisplayState({
      clientNowMs: Date.parse("2026-03-23T18:00:03.200Z"),
      clockOffsetMs: 0,
      countdownPhase: "point-reset",
      startsAt: "2026-03-23T18:00:06.000Z",
      status: "prestart"
    });

    expect(first?.sequenceKey).toBe(repeated?.sequenceKey);
    expect(first?.beatKey).toBe(repeated?.beatKey);
    expect(nextServe?.sequenceKey).not.toBe(first?.sequenceKey);
  });

  it("renders phase-aware labels and drops the active overlay once play is live", () => {
    expect(
      getCountdownDisplayState({
        clientNowMs: Date.parse("2026-03-23T18:00:00.000Z"),
        clockOffsetMs: 0,
        countdownPhase: "point-reset",
        startsAt: "2026-03-23T18:00:03.000Z",
        status: "prestart"
      })
    ).toMatchObject({
      beat: 3,
      label: "Next serve",
      phase: "point-reset"
    });

    expect(
      getCountdownDisplayState({
        clientNowMs: Date.parse("2026-03-23T18:00:03.050Z"),
        clockOffsetMs: 0,
        countdownPhase: "opening-serve",
        startsAt: "2026-03-23T18:00:03.000Z",
        status: "live"
      })
    ).toBeNull();

    expect(getCountdownSequenceKey("opening-serve", undefined)).toBeNull();
    expect(
      createCountdownDisplayState({
        beat: "GO",
        isExit: true,
        phase: "opening-serve",
        sequenceKey: "opening-serve:2026-03-23T18:00:03.000Z"
      })
    ).toMatchObject({
      beat: "GO",
      isExit: true,
      label: "Match starts"
    });
  });
});
