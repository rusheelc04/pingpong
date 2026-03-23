import {
  GAME_CONSTANTS,
  clamp,
  type BallState,
  type LiveMatchState,
  type PlayerSide,
  type ReplayFrame
} from "@pingpong/shared";

import { getEstimatedServerNowMs } from "./live-clock";

const RENDER_DELAY_MS = 50;
const MAX_EXTRAPOLATION_MS = 90;

export interface RenderState {
  ball: {
    x: number;
    y: number;
  };
  paddles: {
    left: number;
    right: number;
  };
  score: {
    left: number;
    right: number;
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function moveToward(current: number, target: number, maxDelta: number) {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

function buildStaticRenderState(state: LiveMatchState): RenderState {
  return {
    ball: { x: state.ball.x, y: state.ball.y },
    paddles: state.paddles,
    score: state.score
  };
}

function shouldUseStaticRenderState(state: LiveMatchState) {
  return (
    state.status !== "live" ||
    Boolean(state.startsAt) ||
    Boolean(state.countdownPhase)
  );
}

function projectBallPosition(ball: BallState, elapsedMs: number) {
  const maxBallY = GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.ballRadius;
  const ticks = elapsedMs / GAME_CONSTANTS.simulationTickMs;
  const projectedX = ball.x + ball.vx * ticks;
  let projectedY = ball.y + ball.vy * ticks;

  while (projectedY < GAME_CONSTANTS.ballRadius || projectedY > maxBallY) {
    if (projectedY < GAME_CONSTANTS.ballRadius) {
      projectedY =
        GAME_CONSTANTS.ballRadius + (GAME_CONSTANTS.ballRadius - projectedY);
    } else {
      projectedY = maxBallY - (projectedY - maxBallY);
    }
  }

  return {
    x: projectedX,
    y: projectedY
  };
}

function getPaddleVelocity(
  previous: LiveMatchState,
  next: LiveMatchState,
  side: PlayerSide
) {
  const elapsedMs = next.serverNowMs - previous.serverNowMs;
  if (
    elapsedMs <= 0 ||
    previous.status !== "live" ||
    next.status !== "live" ||
    previous.score.left !== next.score.left ||
    previous.score.right !== next.score.right
  ) {
    return 0;
  }

  const maxVelocity =
    GAME_CONSTANTS.paddleSpeed / GAME_CONSTANTS.simulationTickMs;

  return clamp(
    (next.paddles[side] - previous.paddles[side]) / elapsedMs,
    -maxVelocity,
    maxVelocity
  );
}

function extrapolateLiveState(
  snapshots: LiveMatchState[],
  targetServerNowMs: number
) {
  const latest = snapshots[snapshots.length - 1];
  const previous =
    snapshots.length > 1 ? snapshots[snapshots.length - 2] : latest;
  const elapsedMs = clamp(
    targetServerNowMs - latest.serverNowMs,
    0,
    MAX_EXTRAPOLATION_MS
  );
  const maxPaddleY = GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight;

  return {
    ball: projectBallPosition(latest.ball, elapsedMs),
    paddles: {
      left: clamp(
        latest.paddles.left +
          getPaddleVelocity(previous, latest, "left") * elapsedMs,
        0,
        maxPaddleY
      ),
      right: clamp(
        latest.paddles.right +
          getPaddleVelocity(previous, latest, "right") * elapsedMs,
        0,
        maxPaddleY
      )
    },
    score: latest.score
  };
}

function interpolateStates(
  previous: LiveMatchState,
  next: LiveMatchState,
  targetServerNowMs: number
) {
  if (
    previous.score.left !== next.score.left ||
    previous.score.right !== next.score.right ||
    previous.status !== "live" ||
    next.status !== "live"
  ) {
    return buildStaticRenderState(next);
  }

  const progress =
    previous.serverNowMs === next.serverNowMs
      ? 1
      : clamp01(
          (targetServerNowMs - previous.serverNowMs) /
            (next.serverNowMs - previous.serverNowMs)
        );

  return {
    ball: {
      x: lerp(previous.ball.x, next.ball.x, progress),
      y: lerp(previous.ball.y, next.ball.y, progress)
    },
    paddles: {
      left: lerp(previous.paddles.left, next.paddles.left, progress),
      right: lerp(previous.paddles.right, next.paddles.right, progress)
    },
    score: next.score
  };
}

function applyControlledPaddlePrediction(
  renderState: RenderState,
  controlledSide: PlayerSide | null,
  predictedPaddleY: number | null
) {
  if (!controlledSide || predictedPaddleY === null) {
    return renderState;
  }

  return {
    ...renderState,
    paddles: {
      ...renderState.paddles,
      [controlledSide]: predictedPaddleY
    }
  };
}

export function buildFrameRenderState(frame: ReplayFrame): RenderState {
  return {
    ball: frame.ball,
    paddles: frame.paddles,
    score: frame.score
  };
}

export function getLiveRenderState(options: {
  snapshots: LiveMatchState[];
  clientNowMs: number;
  clockOffsetMs: number | null;
  controlledSide?: PlayerSide | null;
  predictedPaddleY?: number | null;
}) {
  if (options.snapshots.length === 0) {
    return null;
  }

  const latest = options.snapshots[options.snapshots.length - 1];
  let renderState: RenderState;

  if (options.snapshots.length === 1 || shouldUseStaticRenderState(latest)) {
    renderState = buildStaticRenderState(latest);
  } else {
    const targetServerNowMs =
      getEstimatedServerNowMs(options.clientNowMs, options.clockOffsetMs) -
      RENDER_DELAY_MS;
    const earliest = options.snapshots[0];

    if (targetServerNowMs <= earliest.serverNowMs) {
      renderState = buildStaticRenderState(earliest);
    } else if (targetServerNowMs >= latest.serverNowMs) {
      renderState = extrapolateLiveState(options.snapshots, targetServerNowMs);
    } else {
      let previous = earliest;
      let next = latest;

      for (let index = 1; index < options.snapshots.length; index += 1) {
        if (options.snapshots[index].serverNowMs >= targetServerNowMs) {
          previous = options.snapshots[index - 1];
          next = options.snapshots[index];
          break;
        }
      }

      renderState = interpolateStates(previous, next, targetServerNowMs);
    }
  }

  return applyControlledPaddlePrediction(
    renderState,
    options.controlledSide ?? null,
    options.predictedPaddleY ?? null
  );
}

export function advancePredictedPaddle(options: {
  authoritativeY: number;
  currentY: number;
  elapsedMs: number;
  recentInput: boolean;
  targetY: number;
}) {
  const elapsedMs = Math.min(options.elapsedMs, 48);
  const step =
    (GAME_CONSTANTS.paddleSpeed * elapsedMs) / GAME_CONSTANTS.simulationTickMs;
  const maxPaddleY = GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight;

  let nextY = moveToward(options.currentY, options.targetY, step);
  const drift = options.authoritativeY - nextY;
  const driftTolerance = options.recentInput ? 72 : 2;

  if (Math.abs(drift) > driftTolerance) {
    nextY = moveToward(
      nextY,
      options.authoritativeY,
      step * (options.recentInput ? 0.4 : 1)
    );
  } else if (!options.recentInput) {
    nextY = moveToward(nextY, options.authoritativeY, step * 0.85);
  }

  return clamp(nextY, 0, maxPaddleY);
}
