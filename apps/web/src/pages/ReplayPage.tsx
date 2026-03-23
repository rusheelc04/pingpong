import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { ReplayFrame, ReplayTimeline } from "@pingpong/shared";

import { PongBoard } from "../components/PongBoard";
import { StatusPanel } from "../components/StatusPanel";
import { apiFetch, isAbortError } from "../lib/api";

export function ReplayPage() {
  const { matchId = "" } = useParams();
  const [replay, setReplay] = useState<ReplayTimeline | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    apiFetch<{ replay: ReplayTimeline }>(`/api/matches/${matchId}/replay`, {
      signal: controller.signal
    })
      .then((result) => setReplay(result.replay))
      .catch((requestError: unknown) => {
        if (!isAbortError(requestError)) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load replay."
          );
        }
      });

    return () => controller.abort();
  }, [matchId]);

  useEffect(() => {
    if (!replay || !playing) {
      return;
    }

    const interval = window.setInterval(() => {
      setFrameIndex((current) => {
        if (!replay.frames.length) {
          return 0;
        }

        if (current >= replay.frames.length - 1) {
          setPlaying(false);
          return replay.frames.length - 1;
        }

        return current + 1;
      });
    }, replay.captureMs / speed);

    return () => window.clearInterval(interval);
  }, [playing, replay, speed]);

  const frame: ReplayFrame | null = useMemo(
    () => replay?.frames[frameIndex] ?? null,
    [frameIndex, replay]
  );
  const frameTime = frame ? `${(frame.t / 1000).toFixed(1)}s` : "0.0s";

  if (error && !replay) {
    return (
      <main className="page-shell page-stack stage-page-shell">
        <StatusPanel
          actions={
            <Link className="primary-button" to={`/matches/${matchId}`}>
              Match Summary
            </Link>
          }
          eyebrow="Replay"
          headingLevel="h2"
          message={error}
          title="Replay unavailable"
          tone="danger"
        />
      </main>
    );
  }

  if (!replay) {
    return (
      <main className="page-shell page-stack stage-page-shell">
        <StatusPanel
          eyebrow="Loading"
          headingLevel="h2"
          message="Fetching the saved frame timeline for this match."
          title="Loading replay..."
        />
      </main>
    );
  }

  return (
    <main className="page-shell page-stack stage-page-shell">
      {error ? <p className="error-copy">{error}</p> : null}
      <section className="page-header">
        <span className="eyebrow">Replay Viewer</span>
        <h1 className="match-title">
          {replay.winnerName
            ? `${replay.winnerName} won this one`
            : "Match Replay"}
        </h1>
        <p className="lead-copy">
          Final score {replay.score.left} - {replay.score.right}. Scrub the
          timeline or let the replay play through once.
        </p>
      </section>

      <section className="panel replay-stage-panel">
        <div className="match-stage-frame replay-frame">
          <PongBoard frame={frame} />
        </div>

        <div className="replay-scrubber">
          <label className="replay-scrubber-label" htmlFor="replay-range">
            Frame {replay.frames.length === 0 ? 0 : frameIndex + 1} /{" "}
            {replay.frames.length} at {frameTime}
          </label>
          <input
            id="replay-range"
            max={Math.max(replay.frames.length - 1, 0)}
            min={0}
            onChange={(event) => {
              setPlaying(false);
              setFrameIndex(Number(event.target.value));
            }}
            type="range"
            value={frameIndex}
          />
        </div>

        <div className="replay-toolbar">
          <button
            className="primary-button"
            onClick={() => setPlaying((current) => !current)}
            type="button"
          >
            {playing ? "Pause Replay" : "Resume Replay"}
          </button>
          <button
            className="ghost-button"
            onClick={() => {
              setFrameIndex(0);
              setPlaying(false);
            }}
            type="button"
          >
            Restart
          </button>
          <select
            className="replay-speed-select"
            onChange={(event) => setSpeed(Number(event.target.value))}
            value={speed}
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
          </select>
          <Link className="ghost-button" to={`/matches/${matchId}`}>
            Match Summary
          </Link>
        </div>

        <div className="stat-strip">
          <div>
            <strong>{replay.stats.longestRally}</strong>
            <span>Longest Rally</span>
          </div>
          <div>
            <strong>{replay.stats.paddleHits}</strong>
            <span>Paddle Hits</span>
          </div>
          <div>
            <strong>{replay.stats.durationSeconds}s</strong>
            <span>Duration</span>
          </div>
        </div>
      </section>
    </main>
  );
}
