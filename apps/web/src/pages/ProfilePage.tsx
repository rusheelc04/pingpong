import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { MatchSummary } from "@pingpong/shared";

import { apiFetch, isAbortError } from "../lib/api";
import { useAppContext } from "../lib/app-context";

function getOpponentName(match: MatchSummary, userId: string | undefined) {
  return (
    match.players.find((player) => player.userId !== userId)?.displayName ??
    "Unknown opponent"
  );
}

export function ProfilePage() {
  const { activeMatchId, user } = useAppContext();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch<{ matches: MatchSummary[] }>("/api/matches", {
      signal: controller.signal
    })
      .then((result) => setMatches(result.matches))
      .catch((requestError: unknown) => {
        if (!isAbortError(requestError)) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load your recent matches."
          );
        }
      });

    return () => controller.abort();
  }, []);

  const stats = useMemo(() => {
    const wins = matches.filter(
      (match) => match.winnerId === user?.userId
    ).length;
    const losses = matches.length - wins;
    const winRate =
      matches.length === 0 ? 0 : Math.round((wins / matches.length) * 100);

    return {
      losses,
      winRate,
      wins
    };
  }, [matches, user?.userId]);

  return (
    <main className="page-shell page-stack">
      <section className="page-header">
        <span className="eyebrow">Player Profile</span>
        <h1>{user?.displayName}</h1>
        <p className="lead-copy">
          Your rating, recent matches, and replay links live here.
        </p>
      </section>

      {activeMatchId ? (
        <section className="panel compact-banner">
          <div>
            <h3>Active Match</h3>
            <p className="muted-copy">
              You still have a live match attached to this session.
            </p>
          </div>
          <Link className="primary-button" to={`/matches/${activeMatchId}`}>
            Rejoin Match
          </Link>
        </section>
      ) : null}

      <section className="profile-grid">
        <article className="panel">
          <h2>{user?.rating ?? 0} Elo</h2>
          <p className="muted-copy">
            Completed matches update your record and recent history here.
          </p>
          <div className="stat-strip">
            <div>
              <strong>{matches.length}</strong>
              <span>Completed Matches</span>
            </div>
            <div>
              <strong>{stats.winRate}%</strong>
              <span>Win Rate</span>
            </div>
            <div>
              <strong>
                {stats.wins}W / {stats.losses}L
              </strong>
              <span>Record</span>
            </div>
          </div>
        </article>

        <article className="panel history-panel">
          <div className="panel-toolbar">
            <h3>Recent Matches</h3>
            <Link className="ghost-button" to="/play">
              Play Again
            </Link>
          </div>
          {error ? <p className="error-copy">{error}</p> : null}
          {matches.length === 0 ? (
            <div className="empty-card">
              <strong>No completed matches yet</strong>
              <p className="muted-copy">
                Finish a practice, room, or ranked match and your recent history
                will show up here.
              </p>
            </div>
          ) : (
            <div className="history-list">
              {matches.map((match) => {
                const didWin = match.winnerId === user?.userId;
                const opponent = getOpponentName(match, user?.userId);

                return (
                  <article className="history-row" key={match.id}>
                    <Link
                      className="history-main-link"
                      to={`/matches/${match.id}`}
                    >
                      <div className="history-row-topline">
                        <strong>
                          {match.ranked ? "Ranked" : match.mode} vs {opponent}
                        </strong>
                        <span
                          className={
                            didWin ? "result-chip win" : "result-chip loss"
                          }
                        >
                          {didWin ? "Win" : "Loss"}
                        </span>
                      </div>
                      <div className="history-row-meta">
                        <span>
                          {match.score.left} - {match.score.right}
                        </span>
                        <span>
                          {new Date(match.endedAt).toLocaleDateString()}
                        </span>
                        <span>{match.stats.durationSeconds}s</span>
                      </div>
                    </Link>
                    {match.replayAvailable ? (
                      <Link
                        className="ghost-button"
                        to={`/replays/${match.id}`}
                      >
                        Replay
                      </Link>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
