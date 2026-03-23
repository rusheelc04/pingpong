// RoomPage is the waiting room for private invites, so it keeps join state and sharing feedback visible the whole time.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { formatAppError } from "../lib/api";
import { useAppContext } from "../lib/app-context";

export function RoomPage() {
  const { code = "" } = useParams();
  const roomCode = useMemo(() => code.toUpperCase(), [code]);
  const navigate = useNavigate();
  const { activeMatchId, socket } = useAppContext();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeMatchId) {
      navigate(`/matches/${activeMatchId}`);
    }
  }, [activeMatchId, navigate]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    setError(null);
    socket.emit(
      "room:join",
      { code: roomCode },
      (result: { ok: boolean; error?: string }) => {
        if (!result.ok) {
          setError(
            formatAppError(result.error ?? "Could not join this private room.")
          );
        }
      }
    );

    const handleMatchStart = (payload: { matchId: string }) =>
      navigate(`/matches/${payload.matchId}`);
    socket.on("match:start", handleMatchStart);

    return () => {
      socket.off("match:start", handleMatchStart);
    };
  }, [navigate, roomCode, socket]);

  return (
    <main className="page-shell page-stack">
      <section className="page-header">
        <span className="eyebrow">Private Room</span>
        <h1>Room {roomCode}</h1>
        <p className="lead-copy">
          Share this code. The match will start as soon as the second player
          joins.
        </p>
      </section>
      <section className="panel">
        <div className="room-code-display">{roomCode}</div>
        <div className="waiting-inline">
          <span className="waiting-dot" />
          <span>Waiting for opponent... {elapsedSeconds}s</span>
        </div>
        <div className="hero-actions">
          <button
            className="ghost-button"
            onClick={async () => {
              await navigator.clipboard.writeText(roomCode);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }}
            type="button"
          >
            {copied ? "Copied!" : "Copy room code"}
          </button>
        </div>
        <p className="muted-copy">
          Stay on this page while the room is waiting. You will jump straight
          into the live match.
        </p>
        {error ? <p className="error-copy">{error}</p> : null}
      </section>
    </main>
  );
}
