import { useCallback, useEffect, useState } from "react";

import { apiFetch, isAbortError } from "../lib/api";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
}

function LeaderboardRows({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <div className="leaderboard-table">
      <div className="leaderboard-header-row">
        <span>Rank</span>
        <span>Player</span>
        <span>Rating</span>
        <span>Record</span>
      </div>
      {entries.map((entry) => (
        <div className="leaderboard-row" key={entry.userId}>
          <span>#{entry.rank}</span>
          <strong>{entry.displayName}</strong>
          <span>{entry.rating} Elo</span>
          <span>
            {entry.wins}W / {entry.losses}L
          </span>
        </div>
      ))}
    </div>
  );
}

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadLeaderboard = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true);
    setError(null);

    try {
      const result = await apiFetch<{ leaderboard: LeaderboardEntry[] }>(
        "/api/leaderboard",
        { signal }
      );
      setEntries(result.leaderboard);
    } catch (requestError) {
      if (!isAbortError(requestError)) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load the leaderboard."
        );
      }
    } finally {
      if (!signal?.aborted) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void loadLeaderboard(controller.signal);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadLeaderboard();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadLeaderboard]);

  return (
    <main className="page-shell page-stack">
      <section className="page-header">
        <span className="eyebrow">Competitive Ladder</span>
        <h1>Current Arena Standings</h1>
        <p className="lead-copy">
          The ladder only reflects completed ranked human matches, so practice
          runs and private rooms never pollute the standings.
        </p>
      </section>

      <section className="panel">
        <div className="panel-toolbar">
          <div>
            <h3>Ranked Ladder</h3>
            <p className="muted-copy">
              Only ranked human-vs-human results count toward the arena ladder.
            </p>
          </div>
          <button
            className="ghost-button"
            disabled={refreshing}
            onClick={() => void loadLeaderboard()}
            type="button"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error ? <p className="error-copy">{error}</p> : null}

        {entries.length === 0 ? (
          <div className="empty-card">
            <strong>No ranked results yet</strong>
            <p className="muted-copy">
              Finish a few matches and the competitive table will populate.
            </p>
          </div>
        ) : (
          <LeaderboardRows entries={entries} />
        )}
      </section>
    </main>
  );
}
