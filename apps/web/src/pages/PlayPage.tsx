import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiFetch } from "../lib/api";
import { useAppContext } from "../lib/app-context";

interface QueueStatus {
  state: string;
  queuePosition?: number;
  waitMs?: number;
  ratingWindow?: number;
  roomCode?: string;
}

function formatWait(waitMs: number | undefined) {
  if (!waitMs) {
    return "just now";
  }

  return `${Math.max(1, Math.round(waitMs / 1000))}s`;
}

export function PlayPage() {
  const navigate = useNavigate();
  const { activeMatchId, socket } = useAppContext();
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [roomCreating, setRoomCreating] = useState(false);
  const [showPracticeOffer, setShowPracticeOffer] = useState(false);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleQueueStatus = (payload: QueueStatus) => setStatus(payload);
    const handleMatchLink = (payload: { matchId: string }) => {
      navigate(`/matches/${payload.matchId}`);
    };

    socket.on("queue:status", handleQueueStatus);
    socket.on("match:found", handleMatchLink);
    socket.on("match:start", handleMatchLink);

    return () => {
      socket.off("queue:status", handleQueueStatus);
      socket.off("match:found", handleMatchLink);
      socket.off("match:start", handleMatchLink);
    };
  }, [navigate, socket]);

  useEffect(() => {
    if (status?.state !== "searching") {
      setShowPracticeOffer(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowPracticeOffer(true), 12_000);
    return () => window.clearTimeout(timeout);
  }, [status?.state]);

  const queueBannerCopy = useMemo(() => {
    if (!status) {
      return null;
    }

    if (status.state === "searching") {
      return `Searching for an opponent. Position ${
        status.queuePosition ?? 1
      }, waiting ${formatWait(status.waitMs)}.`;
    }

    if (status.state === "waiting-room") {
      return `Room ${status.roomCode} is open. Share the code when you are ready for the second player to join.`;
    }

    return null;
  }, [status]);

  return (
    <main className="page-shell page-stack">
      <section className="page-header">
        <span className="eyebrow">Play</span>
        <h1>Start your next match</h1>
        <p className="lead-copy">
          Jump into ranked play, open a private room, or warm up against the
          Arcade Bot.
        </p>
      </section>

      {queueBannerCopy ? (
        <section className="panel queue-banner">
          <div>
            <h3>Queue Status</h3>
            <p className="muted-copy">{queueBannerCopy}</p>
          </div>
          {status?.state === "searching" ? (
            <button
              className="ghost-button"
              onClick={() => {
                socket?.emit("queue:leave");
                setStatus(null);
                setShowPracticeOffer(false);
              }}
              type="button"
            >
              Leave Queue
            </button>
          ) : null}
        </section>
      ) : null}

      {activeMatchId ? (
        <section className="panel compact-banner">
          <div>
            <h3>Live Match Ready</h3>
            <p className="muted-copy">
              This session already has a live match attached to it.
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() => navigate(`/matches/${activeMatchId}`)}
            type="button"
          >
            Rejoin Live Match
          </button>
        </section>
      ) : null}

      <section className="play-layout">
        <article className="panel play-primary-card">
          <span className="eyebrow">Competitive</span>
          <h2>Ranked Queue</h2>
          <p className="muted-copy">
            Play a public match, finish the set, and move up the leaderboard.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => {
                setError(null);
                socket?.emit(
                  "queue:join",
                  { mode: "ranked" },
                  (result: { ok: boolean; error?: string }) => {
                    if (!result.ok) {
                      setError(result.error ?? "Could not join ranked queue.");
                    }
                  }
                );
              }}
              type="button"
            >
              Join Ranked Queue
            </button>
            {showPracticeOffer ? (
              <button
                className="ghost-button"
                onClick={() => {
                  socket?.emit("queue:leave");
                  socket?.emit("queue:join", { mode: "practice" });
                }}
                type="button"
              >
                No opponent yet? Start a bot match
              </button>
            ) : null}
          </div>
        </article>

        <div className="play-secondary-stack">
          <article className="panel">
            <span className="eyebrow">Invite Flow</span>
            <h3>Private Room Code</h3>
            <p className="muted-copy">
              Create a room for an unranked match or join with a code from a
              friend.
            </p>
            <button
              className="primary-button"
              disabled={roomCreating}
              onClick={async () => {
                setRoomCreating(true);
                setError(null);
                try {
                  const result = await apiFetch<{ room: { code: string } }>(
                    "/api/rooms",
                    {
                      method: "POST",
                      body: JSON.stringify({})
                    }
                  );
                  navigate(`/rooms/${result.room.code}`);
                } catch (requestError) {
                  setError(
                    requestError instanceof Error
                      ? requestError.message
                      : "Could not create a private room."
                  );
                } finally {
                  setRoomCreating(false);
                }
              }}
              type="button"
            >
              {roomCreating ? "Creating..." : "Create Room"}
            </button>
            <form
              className="inline-form room-join-form"
              onSubmit={(event) => {
                event.preventDefault();
                navigate(`/rooms/${joinCode.trim().toUpperCase()}`);
              }}
            >
              <input
                maxLength={12}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Enter room code"
                value={joinCode}
              />
              <button
                className="ghost-button"
                disabled={!joinCode.trim()}
                type="submit"
              >
                Join Room
              </button>
            </form>
          </article>

          <article className="panel">
            <span className="eyebrow">Warmup</span>
            <h3>Practice vs Arcade Bot</h3>
            <p className="muted-copy">
              Start a quick practice match and keep your timing sharp between
              competitive games.
            </p>
            <button
              className="ghost-button"
              onClick={() => socket?.emit("queue:join", { mode: "practice" })}
              type="button"
            >
              Start Practice Match
            </button>
          </article>
        </div>
      </section>

      {error ? <p className="error-copy">{error}</p> : null}
    </main>
  );
}
