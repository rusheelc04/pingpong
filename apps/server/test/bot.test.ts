import { GAME_CONSTANTS, type BallState } from "@pingpong/shared";
import { describe, expect, test } from "vitest";

import {
  advanceBotMotion,
  getBotNextTargetY,
  getBotReadyY
} from "../src/services/live-match/bot.js";

describe("bot helpers", () => {
  test("keeps the bot centered when the ball is traveling away", () => {
    const ball: BallState = {
      x: GAME_CONSTANTS.boardWidth * 0.7,
      y: 180,
      vx: -7,
      vy: 3
    };

    const nextTarget = getBotNextTargetY(ball, "right", () => 0.5);

    expect(nextTarget.targetY).toBe(getBotReadyY());
    expect(nextTarget.aimOffsetY).toBe(0);
  });

  test("moves toward a new target smoothly instead of teleporting", () => {
    let paddleY = getBotReadyY();
    let velocityY = 0;
    const deltas: number[] = [];

    for (let index = 0; index < 10; index += 1) {
      const next = advanceBotMotion({
        paddleY,
        targetY: GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight,
        velocityY
      });

      deltas.push(next.paddleY - paddleY);
      paddleY = next.paddleY;
      velocityY = next.velocityY;
    }

    expect(deltas[0]).toBeGreaterThan(0);
    expect(deltas[0]).toBeLessThan(GAME_CONSTANTS.paddleSpeed);
    expect(Math.max(...deltas)).toBeLessThan(GAME_CONSTANTS.paddleSpeed);
    expect(paddleY).toBeGreaterThan(getBotReadyY());
  });
});
