import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { PlayerSide } from "@pingpong/shared";

import { ChatPanel } from "../components/ChatPanel";
import { CountdownOverlay } from "../components/CountdownOverlay";
import { PongBoard } from "../components/PongBoard";
import { useAppContext } from "../lib/app-context";
import { useLiveMatchSession } from "../lib/use-live-match-session";

function useCountdownValue(startsAt: string | undefined) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startsAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 80);

    return () => window.clearInterval(interval);
  }, [startsAt]);

  if (!startsAt) {
    return null;
  }

  const remainingMs = new Date(startsAt).getTime() - now;
  if (remainingMs < -320) {
    return null;
  }

  if (remainingMs <= 0) {
    return 0;
  }

  return Math.ceil(remainingMs / 1000);
}

function getReconnectCopy(reconnectDeadline: string) {
  return `Reconnect window ends at ${new Date(
    reconnectDeadline
  ).toLocaleTimeString()}.`;
}

export function MatchPage() {
  const { matchId = "" } = useParams();
  const { user } = useAppContext();
  const {
    error,
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
  const countdownValue = useCountdownValue(liveState?.startsAt);

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

  const countdownLabel =
    liveState?.countdownPhase === "point-reset" ? "Next serve" : "Match starts";

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
      {error && !summary ? <p className="error-copy">{error}</p> : null}
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
              </div>
            </div>

            <div className="match-stage-frame">
              <CountdownOverlay label={countdownLabel} value={countdownValue} />
              {scoreFlashVisible ? <div className="score-flash" /> : null}
              <PongBoard
                controlledSide={playerRole === "spectator" ? null : playerRole}
                interactive={
                  playerRole !== "spectator" &&
                  liveState.status === "live" &&
                  countdownValue === null
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
