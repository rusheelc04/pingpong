import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { LiveMatchState, PlayerSide } from "@pingpong/shared";

import { ChatPanel } from "../components/ChatPanel";
import { CountdownOverlay } from "../components/CountdownOverlay";
import { PongBoard } from "../components/PongBoard";
import { useAppContext } from "../lib/app-context";
import {
  COUNTDOWN_GO_EXIT_MS,
  createCountdownDisplayState,
  getCountdownDisplayState,
  type CountdownDisplayState
} from "../lib/countdown";
import { updateClockOffset } from "../lib/live-clock";
import { useLiveMatchSession } from "../lib/use-live-match-session";

function useCountdownState(liveState: LiveMatchState | null) {
  const [now, setNow] = useState(Date.now());
  const [exitState, setExitState] = useState<CountdownDisplayState | null>(
    null
  );
  const clockOffsetRef = useRef<number | null>(null);
  const previousSequenceRef = useRef<{
    phase: CountdownDisplayState["phase"];
    sequenceKey: string;
  } | null>(null);

  useEffect(() => {
    if (!liveState?.serverNowMs) {
      return;
    }

    clockOffsetRef.current = updateClockOffset(
      clockOffsetRef.current,
      liveState.serverNowMs,
      Date.now()
    );
  }, [liveState?.serverNowMs]);

  const activeState = getCountdownDisplayState({
    clientNowMs: now,
    clockOffsetMs: clockOffsetRef.current,
    countdownPhase: liveState?.countdownPhase,
    startsAt: liveState?.startsAt,
    status: liveState?.status
  });

  useEffect(() => {
    if (liveState?.status !== "prestart" && !exitState?.isExit) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 80);

    return () => window.clearInterval(interval);
  }, [exitState?.isExit, liveState?.status]);

  useEffect(() => {
    if (activeState) {
      previousSequenceRef.current = {
        phase: activeState.phase,
        sequenceKey: activeState.sequenceKey
      };
      setExitState(null);
      return;
    }

    if (liveState?.status === "live" && previousSequenceRef.current) {
      const previousSequence = previousSequenceRef.current;
      previousSequenceRef.current = null;
      setExitState(
        createCountdownDisplayState({
          beat: "GO",
          isExit: true,
          phase: previousSequence.phase,
          sequenceKey: previousSequence.sequenceKey
        })
      );
      return;
    }

    if (liveState?.status !== "live") {
      previousSequenceRef.current = null;
      setExitState(null);
    }
  }, [activeState, liveState?.status]);

  useEffect(() => {
    if (!exitState?.isExit) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setExitState((current) =>
        current?.beatKey === exitState.beatKey ? null : current
      );
    }, COUNTDOWN_GO_EXIT_MS);

    return () => window.clearTimeout(timeout);
  }, [exitState]);

  return activeState ?? exitState;
}

function PauseCountdown({ resumesAt }: { resumesAt: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const remaining = Math.max(
    0,
    Math.ceil((new Date(resumesAt).getTime() - now) / 1000)
  );

  return <span className="pause-overlay-timer">Resuming in {remaining}s</span>;
}

function getReconnectCopy(reconnectDeadline: string) {
  return `Reconnect window ends at ${new Date(
    reconnectDeadline
  ).toLocaleTimeString()}.`;
}

export function MatchPage() {
  const { matchId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAppContext();
  const {
    error,
    finalizationFailed,
    liveState,
    loading,
    messages,
    playerRole,
    presence,
    reconnectDeadline,
    socket,
    summary
  } = useLiveMatchSession(matchId);
  const [chatOpen, setChatOpen] = useState(false);
  const [focusPlay, setFocusPlay] = useState(false);
  const [scoreFlashVisible, setScoreFlashVisible] = useState(false);
  const previousScoreRef = useRef<string | null>(null);
  const countdownState = useCountdownState(liveState);

  useEffect(() => {
    if (!finalizationFailed) {
      return;
    }

    const timeout = window.setTimeout(() => {
      navigate("/play", { replace: true });
    }, 4_000);

    return () => window.clearTimeout(timeout);
  }, [finalizationFailed, navigate]);

  useEffect(() => {
    if (!liveState || liveState.ranked || playerRole === "spectator") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const canPause = (liveState.pausesLeft?.[playerRole] ?? 0) > 0;
        const canUnpause = liveState.status === "paused" && liveState.pauseInfo;
        if (canPause || canUnpause) {
          socket?.emit("pause:toggle", { matchId });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [liveState, playerRole, matchId, socket]);

  useEffect(() => {
    if (!liveState) {
      setFocusPlay(false);
      return;
    }

    document.body.dataset.focusPlay = focusPlay ? "true" : "false";
    return () => {
      delete document.body.dataset.focusPlay;
    };
  }, [focusPlay, liveState]);

  useEffect(() => {
    if (!liveState) {
      previousScoreRef.current = null;
      return;
    }

    const nextScoreKey = `${liveState.score.left}-${liveState.score.right}`;
    if (previousScoreRef.current && previousScoreRef.current !== nextScoreKey) {
      setScoreFlashVisible(true);
      const timeout = window.setTimeout(() => setScoreFlashVisible(false), 320);
      previousScoreRef.current = nextScoreKey;
      return () => window.clearTimeout(timeout);
    }

    previousScoreRef.current = nextScoreKey;
  }, [liveState]);

  const viewerPlayer = summary?.players.find(
    (player) => player.userId === user?.userId
  );
  const viewerDidWin = Boolean(
    summary?.winnerId && user?.userId && summary.winnerId === user.userId
  );
  const viewerRatingDelta =
    viewerPlayer && summary?.ranked
      ? viewerPlayer.ratingAfter - viewerPlayer.ratingBefore
      : null;

  const resultToneClass =
    viewerRatingDelta === null
      ? undefined
      : viewerRatingDelta >= 0
        ? "success-copy"
        : "error-copy";

  const modeLabel = liveState?.ranked
    ? "Ranked Match"
    : liveState?.mode === "practice"
      ? "Practice Match"
      : "Private Match";

  const playerStatus = useMemo(() => {
    if (!liveState) {
      return [];
    }

    return [
      {
        side: "left" as PlayerSide,
        name: liveState.players.left.displayName,
        connected: presence[liveState.players.left.userId] !== false,
        rating: liveState.players.left.rating
      },
      {
        side: "right" as PlayerSide,
        name: liveState.players.right.displayName,
        connected: presence[liveState.players.right.userId] !== false,
        rating: liveState.players.right.rating
      }
    ];
  }, [liveState, presence]);

  if (loading && !summary && !liveState) {
    return (
      <main className="page-shell page-stack">
        <section className="panel">Loading match...</section>
      </main>
    );
  }

  return (
    <main
      className={`page-shell page-stack ${
        liveState ? "page-shell-wide stage-page-shell" : ""
      }`}
    >
      {error && !summary && !finalizationFailed ? (
        <p className="error-copy">{error}</p>
      ) : null}
      {liveState ? (
        <section
          className={`match-stage-layout ${chatOpen ? "chat-open" : ""}`}
        >
          <article className="panel match-stage-panel">
            <div className="match-stage-header">
              <div className="match-stage-copy">
                <span className="eyebrow">{modeLabel}</span>
                <h1 className="match-title">
                  {liveState.players.left.displayName} vs{" "}
                  {liveState.players.right.displayName}
                </h1>
                <p className="muted-copy match-subcopy">
                  {playerRole === "spectator"
                    ? "Watching this match live."
                    : "Stay on the board, open chat when you need it, and use focus mode for a cleaner view."}
                </p>
              </div>
              <div className="match-stage-actions">
                <span className="status-pill">
                  {playerRole === "spectator" ? "Spectating" : "Playing"}
                </span>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setChatOpen((current) => !current);
                    if (focusPlay) {
                      setFocusPlay(false);
                    }
                  }}
                  type="button"
                >
                  {chatOpen ? "Hide Chat" : "Open Chat"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setFocusPlay((current) => !current);
                    if (!focusPlay) {
                      setChatOpen(false);
                    }
                  }}
                  type="button"
                >
                  {focusPlay ? "Exit Focus" : "Focus Play"}
                </button>
                {!liveState.ranked &&
                  playerRole !== "spectator" &&
                  (liveState.pausesLeft?.[playerRole] ?? 0) > 0 && (
                    <button
                      className="ghost-button pause-button"
                      onClick={() => socket?.emit("pause:toggle", { matchId })}
                      type="button"
                    >
                      {liveState.status === "paused" && liveState.pauseInfo
                        ? "Resume"
                        : `Pause (${liveState.pausesLeft?.[playerRole] ?? 0})`}
                    </button>
                  )}
              </div>
            </div>

            <div className="match-stage-frame">
              <CountdownOverlay state={countdownState} />
              {liveState.pauseInfo ? (
                <div className="pause-overlay">
                  <span className="pause-overlay-label">
                    Paused by {liveState.pauseInfo.pausedByName}
                  </span>
                  <PauseCountdown resumesAt={liveState.pauseInfo.resumesAt} />
                  {playerRole !== "spectator" && (
                    <button
                      className="ghost-button"
                      onClick={() => socket?.emit("pause:toggle", { matchId })}
                      type="button"
                    >
                      Resume
                    </button>
                  )}
                </div>
              ) : null}
              {scoreFlashVisible ? <div className="score-flash" /> : null}
              <PongBoard
                controlledSide={playerRole === "spectator" ? null : playerRole}
                interactive={
                  playerRole !== "spectator" && liveState.status === "live"
                }
                onMove={(position: number) =>
                  socket?.emit("input:move", { matchId, position })
                }
                state={liveState}
              />
            </div>

            <div className="player-status-strip">
              {playerStatus.map((player) => (
                <article
                  className={`player-status-card player-status-${player.side}`}
                  key={player.side}
                >
                  <span className="player-status-side">
                    {player.side === "left" ? "Left Paddle" : "Right Paddle"}
                  </span>
                  <strong>{player.name}</strong>
                  <div className="player-status-meta">
                    <span>{player.rating} Elo</span>
                    <span
                      className={
                        player.connected
                          ? "player-status-online"
                          : "player-status-offline"
                      }
                    >
                      {player.connected ? "Connected" : "Reconnecting"}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            {reconnectDeadline ? (
              <p className="muted-copy match-reconnect-copy">
                {getReconnectCopy(reconnectDeadline)}
              </p>
            ) : null}
          </article>

          <aside className={`match-chat-rail ${chatOpen ? "open" : ""}`}>
            <ChatPanel
              matchId={matchId}
              messages={messages}
              players={liveState.players}
              socket={socket}
            />
          </aside>
        </section>
      ) : summary ? (
        <section className="panel result-stage-panel">
          <div className="result-stage-copy">
            <span className="eyebrow">
              {summary.ranked ? "Ranked Result" : "Match Complete"}
            </span>
            <h1 className="match-title">
              {viewerPlayer
                ? viewerDidWin
                  ? "You won"
                  : "You lost"
                : `${summary.winnerName} wins`}
            </h1>
            <p className="lead-copy">
              Final score {summary.score.left} - {summary.score.right}. Ended by{" "}
              {summary.endedBy}.
            </p>
            {viewerRatingDelta !== null ? (
              <p className={resultToneClass}>
                {viewerRatingDelta >= 0 ? "+" : ""}
                {viewerRatingDelta} Elo
              </p>
            ) : null}
          </div>

          <div className="stat-strip result-stat-strip">
            <div>
              <strong>{summary.stats.longestRally}</strong>
              <span>Longest Rally</span>
            </div>
            <div>
              <strong>{summary.stats.paddleHits}</strong>
              <span>Paddle Hits</span>
            </div>
            <div>
              <strong>{summary.stats.durationSeconds}s</strong>
              <span>Duration</span>
            </div>
          </div>

          <div className="hero-actions">
            <Link className="primary-button" to={`/replays/${matchId}`}>
              Watch Replay
            </Link>
            <Link className="ghost-button" to="/play">
              Back to Arena Hub
            </Link>
          </div>
        </section>
      ) : finalizationFailed ? (
        <section className="panel result-stage-panel">
          <div className="result-stage-copy">
            <span className="eyebrow">Result Recovery</span>
            <h1 className="match-title">We could not save that result</h1>
            <p className="lead-copy">
              The match ended, but the server could not safely persist the
              outcome. You will be returned to the arena hub shortly.
            </p>
            {error ? <p className="error-copy">{error}</p> : null}
          </div>

          <div className="hero-actions">
            <Link className="primary-button" to="/play">
              Back to Arena Hub
            </Link>
          </div>
        </section>
      ) : (
        <section className="panel">
          <h3>Match unavailable</h3>
          <p className="muted-copy">
            This match could not be loaded or is no longer available.
          </p>
        </section>
      )}
    </main>
  );
}
