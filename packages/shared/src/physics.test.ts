// Physics tests lock down the small math rules that the server relies on every frame.
import { describe, expect, it } from "vitest";

import { GAME_CONSTANTS, createServe, stepBall } from "./index.js";

describe("physics helpers", () => {
  it("creates a centered serve", () => {
    const serve = createServe(() => 0.75);
    expect(serve.x).toBe(GAME_CONSTANTS.boardWidth / 2);
    expect(serve.y).toBe(GAME_CONSTANTS.boardHeight / 2);
    expect(serve.vx).toBeGreaterThan(0);
  });

  it("scores when the ball exits the left edge", () => {
    const result = stepBall({
      ball: { x: -20, y: 120, vx: -8, vy: 0 },
      leftPaddleY: 300,
      rightPaddleY: 100
    });

    expect(result.scoredOn).toBe("left");
  });

  it("bounces off a paddle", () => {
    const result = stepBall({
      ball: {
        x:
          GAME_CONSTANTS.leftPaddleX +
          GAME_CONSTANTS.paddleWidth +
          GAME_CONSTANTS.ballRadius,
        y: 160,
        vx: -8,
        vy: 0
      },
      leftPaddleY: 100,
      rightPaddleY: 100
    });

    expect(result.paddleHit).toBe(true);
    expect(result.ball.vx).toBeGreaterThan(0);
  });
});
