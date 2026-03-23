import { useEffect, useRef } from "react";

import {
  GAME_CONSTANTS,
  type PlayerSide,
  type ReplayFrame
} from "@pingpong/shared";

import { updateClockOffset } from "../lib/live-clock";
import {
  advancePredictedPaddle,
  buildFrameRenderState,
  getLiveRenderState,
  type RenderState
} from "../lib/live-render";

import type { LiveMatchState } from "@pingpong/shared";

interface PongBoardProps {
  state?: LiveMatchState | null;
  frame?: ReplayFrame | null;
  onMove?: (position: number) => void;
  interactive?: boolean;
  controlledSide?: PlayerSide | null;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function drawBoard(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  sourceState: RenderState,
  trail: Array<{ x: number; y: number }>
) {
  const scaleX = canvas.width / GAME_CONSTANTS.boardWidth;
  const scaleY = canvas.height / GAME_CONSTANTS.boardHeight;

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);

  context.fillStyle = "rgba(5, 13, 28, 0.98)";
  context.fillRect(0, 0, GAME_CONSTANTS.boardWidth, GAME_CONSTANTS.boardHeight);

  context.strokeStyle = "rgba(83, 208, 255, 0.18)";
  context.lineWidth = 4;
  context.setLineDash([14, 16]);
  context.beginPath();
  context.moveTo(GAME_CONSTANTS.boardWidth / 2, 0);
  context.lineTo(GAME_CONSTANTS.boardWidth / 2, GAME_CONSTANTS.boardHeight);
  context.stroke();
  context.setLineDash([]);

  context.shadowBlur = 18;
  context.shadowColor = "#53d0ff";
  context.fillStyle = "#53d0ff";
  context.fillRect(
    GAME_CONSTANTS.leftPaddleX,
    sourceState.paddles.left,
    GAME_CONSTANTS.paddleWidth,
    GAME_CONSTANTS.paddleHeight
  );

  context.shadowColor = "#ff5fc4";
  context.fillStyle = "#ff5fc4";
  context.fillRect(
    GAME_CONSTANTS.rightPaddleX,
    sourceState.paddles.right,
    GAME_CONSTANTS.paddleWidth,
    GAME_CONSTANTS.paddleHeight
  );

  trail.forEach((position, index) => {
    const opacity = (index + 1) / (trail.length * 5);
    const radius = GAME_CONSTANTS.ballRadius * (0.55 + index / 10);
    context.beginPath();
    context.shadowColor = "transparent";
    context.fillStyle = `rgba(213, 255, 95, ${opacity})`;
    context.arc(position.x, position.y, radius, 0, Math.PI * 2);
    context.fill();
  });

  context.beginPath();
  context.shadowColor = "#d5ff5f";
  context.fillStyle = "#d5ff5f";
  context.arc(
    sourceState.ball.x,
    sourceState.ball.y,
    GAME_CONSTANTS.ballRadius,
    0,
    Math.PI * 2
  );
  context.fill();

  context.shadowBlur = 0;
  context.fillStyle = "rgba(255,255,255,0.82)";
  context.font = "72px 'Oxanium', sans-serif";
  context.textAlign = "center";
  context.fillText(
    String(sourceState.score.left),
    GAME_CONSTANTS.boardWidth * 0.25,
    84
  );
  context.fillText(
    String(sourceState.score.right),
    GAME_CONSTANTS.boardWidth * 0.75,
    84
  );
}

export function PongBoard({
  state,
  frame,
  onMove,
  interactive = false,
  controlledSide = null
}: PongBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const keyboardPositionRef = useRef(0.5);
  const lastEmittedRef = useRef<number | null>(null);
  const pressedKeysRef = useRef(new Set<string>());
  const snapshotBufferRef = useRef<LiveMatchState[]>([]);
  const clockOffsetRef = useRef<number | null>(null);
  const liveStateRef = useRef<LiveMatchState | null>(null);
  const localPaddleYRef = useRef<number | null>(null);
  const localTargetYRef = useRef<number | null>(null);
  const lastInputAtRef = useRef<number | null>(null);
  const lastPredictionAtRef = useRef<number | null>(null);
  const replayFrameRef = useRef<ReplayFrame | null>(null);
  const activePointerRef = useRef<number | null>(null);

  useEffect(() => {
    liveStateRef.current = state ?? null;
    if (!state) {
      clockOffsetRef.current = null;
      localPaddleYRef.current = null;
      localTargetYRef.current = null;
      lastInputAtRef.current = null;
      lastPredictionAtRef.current = null;
      snapshotBufferRef.current = [];
      trailRef.current = [];
      return;
    }

    const receivedAtMs = Date.now();
    clockOffsetRef.current = updateClockOffset(
      clockOffsetRef.current,
      state.serverNowMs,
      receivedAtMs
    );

    const nextBuffer = [...snapshotBufferRef.current];
    const previousSnapshot = nextBuffer[nextBuffer.length - 1];
    if (
      previousSnapshot &&
      (previousSnapshot.score.left !== state.score.left ||
        previousSnapshot.score.right !== state.score.right)
    ) {
      trailRef.current = [];
    }

    if (
      !previousSnapshot ||
      previousSnapshot.serverNowMs !== state.serverNowMs ||
      previousSnapshot.status !== state.status ||
      previousSnapshot.startsAt !== state.startsAt ||
      previousSnapshot.countdownPhase !== state.countdownPhase
    ) {
      nextBuffer.push(state);
    } else {
      nextBuffer[nextBuffer.length - 1] = state;
    }

    snapshotBufferRef.current = nextBuffer.slice(-12);

    if (!controlledSide) {
      return;
    }

    const authoritativeY = state.paddles[controlledSide];
    const normalizedPosition =
      authoritativeY /
      (GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight);
    const recentInput =
      lastInputAtRef.current !== null &&
      receivedAtMs - lastInputAtRef.current < 160;
    const scoreChanged =
      previousSnapshot &&
      (previousSnapshot.score.left !== state.score.left ||
        previousSnapshot.score.right !== state.score.right);

    if (
      localPaddleYRef.current === null ||
      scoreChanged ||
      state.status !== "live" ||
      !recentInput
    ) {
      localPaddleYRef.current = authoritativeY;
      localTargetYRef.current = authoritativeY;
      keyboardPositionRef.current = normalizedPosition;
    }
  }, [controlledSide, state]);

  useEffect(() => {
    replayFrameRef.current = frame ?? null;
    if (!frame) {
      return;
    }

    trailRef.current = [...trailRef.current, frame.ball].slice(-8);
  }, [frame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    let frameId = 0;

    const syncCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth || GAME_CONSTANTS.boardWidth;
      const cssHeight =
        canvas.clientHeight ||
        (cssWidth * GAME_CONSTANTS.boardHeight) / GAME_CONSTANTS.boardWidth;
      const width = Math.round(cssWidth * dpr);
      const height = Math.round(cssHeight * dpr);

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };

    const draw = () => {
      syncCanvasSize();

      const nowMs = Date.now();
      const replayFrame = replayFrameRef.current;
      const liveState = liveStateRef.current;

      if (liveState && controlledSide && localPaddleYRef.current !== null) {
        const authoritativeY = liveState.paddles[controlledSide];
        const targetY = localTargetYRef.current ?? authoritativeY;
        const elapsedMs = nowMs - (lastPredictionAtRef.current ?? nowMs);

        localPaddleYRef.current = advancePredictedPaddle({
          authoritativeY,
          currentY: localPaddleYRef.current,
          elapsedMs,
          recentInput:
            interactive &&
            lastInputAtRef.current !== null &&
            nowMs - lastInputAtRef.current < 160,
          targetY
        });
        lastPredictionAtRef.current = nowMs;
      }

      const renderState = replayFrame
        ? buildFrameRenderState(replayFrame)
        : getLiveRenderState({
            snapshots: snapshotBufferRef.current,
            clientNowMs: nowMs,
            clockOffsetMs: clockOffsetRef.current,
            controlledSide,
            predictedPaddleY:
              interactive && controlledSide ? localPaddleYRef.current : null
          });

      if (renderState) {
        trailRef.current = [...trailRef.current, renderState.ball].slice(-8);
        drawBoard(context, canvas, renderState, trailRef.current);
      }

      frameId = window.requestAnimationFrame(draw);
    };

    frameId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frameId);
  }, [controlledSide, interactive]);

  useEffect(() => {
    if (!interactive || !onMove || !canvasRef.current) {
      pressedKeysRef.current.clear();
      lastEmittedRef.current = null;
      activePointerRef.current = null;
      return;
    }

    const canvas = canvasRef.current;

    const emitMove = (normalized: number) => {
      const quantized = Math.round(clamp01(normalized) * 1000) / 1000;
      if (lastEmittedRef.current === quantized) {
        return;
      }

      lastEmittedRef.current = quantized;
      localTargetYRef.current =
        quantized * (GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight);
      if (localPaddleYRef.current === null) {
        localPaddleYRef.current = localTargetYRef.current;
      }
      lastInputAtRef.current = Date.now();
      onMove(quantized);
    };

    const movePointer = (clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const normalized = (clientY - rect.top) / rect.height;
      keyboardPositionRef.current = clamp01(normalized);
      emitMove(keyboardPositionRef.current);
    };

    const handlePointerDown = (event: PointerEvent) => {
      activePointerRef.current = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      movePointer(event.clientY);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (
        event.pointerType === "mouse" ||
        activePointerRef.current === event.pointerId
      ) {
        movePointer(event.clientY);
      }
    };

    const clearPointer = (event: PointerEvent) => {
      if (activePointerRef.current === event.pointerId) {
        activePointerRef.current = null;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "w", "W", "s", "S"].includes(event.key)) {
        pressedKeysRef.current.add(event.key);
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      pressedKeysRef.current.delete(event.key);
    };

    let frameId = 0;
    const keyboardStep =
      GAME_CONSTANTS.paddleSpeed /
      (GAME_CONSTANTS.boardHeight - GAME_CONSTANTS.paddleHeight);

    const loop = () => {
      const wantsUp = ["ArrowUp", "w", "W"].some((key) =>
        pressedKeysRef.current.has(key)
      );
      const wantsDown = ["ArrowDown", "s", "S"].some((key) =>
        pressedKeysRef.current.has(key)
      );

      if (wantsUp && !wantsDown) {
        keyboardPositionRef.current = Math.max(
          0,
          keyboardPositionRef.current - keyboardStep
        );
        emitMove(keyboardPositionRef.current);
      }

      if (wantsDown && !wantsUp) {
        keyboardPositionRef.current = Math.min(
          1,
          keyboardPositionRef.current + keyboardStep
        );
        emitMove(keyboardPositionRef.current);
      }

      frameId = window.requestAnimationFrame(loop);
    };

    frameId = window.requestAnimationFrame(loop);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", clearPointer);
    canvas.addEventListener("pointercancel", clearPointer);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    const pressedKeys = pressedKeysRef.current;

    return () => {
      window.cancelAnimationFrame(frameId);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", clearPointer);
      canvas.removeEventListener("pointercancel", clearPointer);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      pressedKeys.clear();
      lastEmittedRef.current = null;
      activePointerRef.current = null;
    };
  }, [interactive, onMove]);

  return (
    <canvas
      aria-label="Live ping pong game"
      className="pong-board"
      ref={canvasRef}
      role="img"
    />
  );
}
