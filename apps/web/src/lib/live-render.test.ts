import type { LiveMatchState } from "@pingpong/shared";
import { describe, expect, it } from "vitest";

import { advancePredictedPaddle, getLiveRenderState } from "./live-render";

function createLiveState(overrides: Partial<LiveMatchState>): LiveMatchState {
  return {
    matchId: "match-1",
    mode: "practice",
    ranked: false,
    status: "live",
    players: {
      left: {
        userId: "left",
        displayName: "Left",
        rating: 1000
      },
      right: {
        userId: "right",
        displayName: "Right",
        rating: 1200,
        isBot: true
      }
    },
    paddles: {
      left: 240,
      right: 240
    },
    ball: {
      x: 500,
      y: 300,
      vx: 6,
      vy: 0
    },
    score: {
      left: 0,
      right: 0
    },
    startedAt: "2026-03-23T18:00:00.000Z",
    serverNowMs: 1_000,
    ...overrides
  };
}

describe("live render helpers", () => {
  it("extrapolates the live ball briefly instead of freezing on a missing packet", () => {
    const renderState = getLiveRenderState({
      snapshots: [
        createLiveState({
          ball: { x: 500, y: 300, vx: 6, vy: 0 },
          paddles: { left: 240, right: 240 },
          serverNowMs: 1_000
        }),
        createLiveState({
          ball: { x: 512, y: 300, vx: 6, vy: 0 },
          paddles: { left: 252, right: 240 },
          serverNowMs: 1_033
        })
      ],
      clientNowMs: 1_150,
      clockOffsetMs: 0
    });

    expect(renderState).not.toBeNull();
    expect(renderState?.ball.x ?? 0).toBeGreaterThan(512);
    expect(renderState?.paddles.left ?? 0).toBeGreaterThan(252);
  });

  it("lets the local paddle move immediately and then reconcile back", () => {
    const predicted = advancePredictedPaddle({
      authoritativeY: 210,
      currentY: 200,
      elapsedMs: 16,
      recentInput: true,
      targetY: 320
    });
    const reconciled = advancePredictedPaddle({
      authoritativeY: 210,
      currentY: predicted,
      elapsedMs: 16,
      recentInput: false,
      targetY: 210
    });

    expect(predicted).toBeGreaterThan(200);
    expect(reconciled).toBeLessThan(predicted);
    expect(reconciled).toBeGreaterThanOrEqual(210);
  });
});
