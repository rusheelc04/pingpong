import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { HeroCanvas } from "../components/HeroCanvas";
import { useAppContext } from "../lib/app-context";

export function LandingPage() {
  const navigate = useNavigate();
  const { user, loginAsGuest } = useAppContext();
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="page-shell landing-grid">
      <section className="hero-copy">
        <span className="eyebrow">Online Ping Pong</span>
        <h1 className="landing-title">
          Play ranked matches, open private rooms, and revisit finished games.
        </h1>
        <p className="lead-copy">
          Choose a name, jump into ranked play, create a room for a friend, or
          warm up against the Arcade Bot.
        </p>

        <div className="hero-actions">
          {user ? (
            <Link className="primary-button" to="/play">
              Go to Play
            </Link>
          ) : (
            <form
              className="guest-form"
              id="guest-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setSubmitting(true);
                setError(null);
                try {
                  await loginAsGuest(displayName);
                  navigate("/play");
                } catch (requestError) {
                  setError(
                    requestError instanceof Error
                      ? requestError.message
                      : "Could not create guest session."
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              <label className="field-stack" htmlFor="guest-display-name">
                <span className="field-label">Choose a display name</span>
                <input
                  id="guest-display-name"
                  maxLength={24}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Choose a display name"
                  value={displayName}
                />
              </label>
              <button
                className="primary-button"
                disabled={!displayName.trim() || submitting}
                type="submit"
              >
                {submitting ? "Starting..." : "Play as Guest"}
              </button>
            </form>
          )}
          <Link className="ghost-button" to="/leaderboard">
            View Leaderboard
          </Link>
        </div>

        {error ? <p className="error-copy">{error}</p> : null}

        <div className="hero-highlight-strip">
          <article className="feature-card feature-stat-card">
            <strong>Ranked Matches</strong>
            <span className="muted-copy">
              Join the public queue, play for rating, and move up the
              leaderboard.
            </span>
          </article>
          <article className="feature-card feature-stat-card">
            <strong>Private Rooms</strong>
            <span className="muted-copy">
              Create a room code and start an unranked match with a second
              player.
            </span>
          </article>
          <article className="feature-card feature-stat-card">
            <strong>Replay History</strong>
            <span className="muted-copy">
              Review finished matches with saved stats and a replay timeline.
            </span>
          </article>
        </div>
      </section>

      <section className="hero-board-card">
        <HeroCanvas />
        <div className="hero-board-caption">
          <span className="eyebrow">Arena Preview</span>
          <p className="muted-copy">
            A clear board layout keeps the action easy to read on desktop and
            mobile.
          </p>
        </div>
      </section>
    </main>
  );
}
