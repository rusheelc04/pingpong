import {
  GAME_CONSTANTS,
  clamp,
  type BallState,
  type PlayerSide
} from "@pingpong/shared";

const BOT_REACTION_MS = 140;
const BOT_AIM_VARIANCE_PX = 22;
const BOT_MAX_SPEED = GAME_CONSTANTS.paddleSpeed * 0.78;
const BOT_ACCELERATION = GAME_CONSTANTS.paddleSpeed * 0.18;
const BOT_SETTLE_EPSILON = 1.5;

function getBotInterceptX(side: PlayerSide) {
  return side === "left"
    ? GAME_CONSTANTS.leftPaddleX +
        GAME_CONSTANTS.paddleWidth +
        GAME_CONSTANTS.ballRadius
    : GAME_CONSTANTS.rightPaddleX - GAME_CONSTANTS.ballRadius;
}

function reflectBallY(projectedY: number) {
  const minY = GAME_CONSTANTS.ballRadius;
  const maxY = GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.ballRadius;
  const span = maxY - minY;

  if (span <= 0) {
    return minY;
  }

  let normalized = projectedY - minY;
  const wrappedSpan = span * 2;
  normalized = ((normalized % wrappedSpan) + wrappedSpan) % wrappedSpan;

  if (normalized > span) {
    normalized = wrappedSpan - normalized;
  }

  return minY + normalized;
}

function getPredictedInterceptY(ball: BallState, side: PlayerSide) {
  const interceptX = getBotInterceptX(side);
  const ballMovingTowardBot =
    (side === "left" && ball.vx < 0) || (side === "right" && ball.vx > 0);

  if (!ballMovingTowardBot || Math.abs(ball.vx) < 0.001) {
    return GAME_CONSTANTS.boardHeight / 2;
  }

  const timeToIntercept = (interceptX - ball.x) / ball.vx;
  if (timeToIntercept <= 0) {
    return GAME_CONSTANTS.boardHeight / 2;
  }

  return reflectBallY(ball.y + ball.vy * timeToIntercept);
}

export function getBotReadyY() {
  return GAME_CONSTANTS.boardHeight / 2 - GAME_CONSTANTS.paddleHeight / 2;
}

export function getBotNextTargetY(
  ball: BallState,
  side: PlayerSide,
  random = Math.random
) {
  const interceptY = getPredictedInterceptY(ball, side);
  const aimOffsetY = (random() - 0.5) * BOT_AIM_VARIANCE_PX;
  const targetY = clamp(
    interceptY - GAME_CONSTANTS.paddleHeight / 2 + aimOffsetY,
    0,
    GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight
  );

  return {
    aimOffsetY,
    targetY
  };
}

export function advanceBotMotion(options: {
  paddleY: number;
  targetY: number;
  velocityY: number;
}) {
  const delta = options.targetY - options.paddleY;
  const desiredVelocity = clamp(delta * 0.18, -BOT_MAX_SPEED, BOT_MAX_SPEED);
  const velocityDelta = clamp(
    desiredVelocity - options.velocityY,
    -BOT_ACCELERATION,
    BOT_ACCELERATION
  );
  let velocityY = clamp(
    options.velocityY + velocityDelta,
    -BOT_MAX_SPEED,
    BOT_MAX_SPEED
  );

  if (Math.abs(delta) <= BOT_SETTLE_EPSILON && Math.abs(velocityY) < 0.6) {
    velocityY = 0;
  }

  let paddleY = clamp(
    options.paddleY + velocityY,
    0,
    GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight
  );

  if (
    paddleY === 0 ||
    paddleY === GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight
  ) {
    velocityY = 0;
  }

  if (Math.abs(options.targetY - paddleY) <= BOT_SETTLE_EPSILON) {
    paddleY = options.targetY;
    velocityY = 0;
  }

  return {
    paddleY,
    velocityY
  };
}

export function getBotReactionMs() {
  return BOT_REACTION_MS;
}
