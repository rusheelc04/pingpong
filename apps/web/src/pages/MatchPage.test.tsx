import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import { MatchPage } from "./MatchPage";

const { mockUseLiveMatchSession } = vi.hoisted(() => ({
  mockUseLiveMatchSession: vi.fn()
}));

vi.mock("../lib/use-live-match-session", () => ({
  useLiveMatchSession: mockUseLiveMatchSession
}));

vi.mock("../lib/app-context", () => ({
  useAppContext: () => ({
    user: {
      userId: "player-1",
      displayName: "RefreshTester",
      rating: 1048,
      provider: "guest"
    }
  })
}));

describe("MatchPage", () => {
  it("suppresses stale live-only errors once a completed summary exists", () => {
    mockUseLiveMatchSession.mockReturnValue({
      error: "Match is no longer live.",
      finalizationFailed: false,
      liveState: null,
      loading: false,
      messages: [],
      playerRole: "left",
      presence: {},
      reconnectDeadline: null,
      socket: null,
      summary: {
        id: "ended-1",
        mode: "practice",
        ranked: false,
        status: "ended",
        score: { left: 6, right: 11 },
        players: [
          {
            side: "left",
            userId: "player-1",
            displayName: "RefreshTester",
            ratingBefore: 1048,
            ratingAfter: 1048
          },
          {
            side: "right",
            userId: "bot-1",
            displayName: "Arcade Bot",
            ratingBefore: 1200,
            ratingAfter: 1200,
            isBot: true
          }
        ],
        winnerId: "bot-1",
        winnerName: "Arcade Bot",
        endedBy: "score",
        startedAt: "2026-03-20T01:00:00.000Z",
        endedAt: "2026-03-20T01:05:00.000Z",
        stats: {
          rallyCount: 10,
          longestRally: 5,
          paddleHits: 18,
          maxBallSpeed: 12,
          durationSeconds: 300
        },
        replayAvailable: true,
        isLive: false
      }
    });

    render(
      <MemoryRouter initialEntries={["/matches/ended-1"]}>
        <Routes>
          <Route path="/matches/:matchId" element={<MatchPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: /you lost/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/match is no longer live/i)
    ).not.toBeInTheDocument();
  });

  it("shows a recovery panel when finalization fails", () => {
    mockUseLiveMatchSession.mockReturnValue({
      error:
        "This match ended, but the server could not safely save the result.",
      finalizationFailed: true,
      liveState: null,
      loading: false,
      messages: [],
      playerRole: "left",
      presence: {},
      reconnectDeadline: null,
      socket: null,
      summary: null
    });

    render(
      <MemoryRouter initialEntries={["/matches/live-1"]}>
        <Routes>
          <Route path="/matches/:matchId" element={<MatchPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: /we could not save that result/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/could not safely save the result/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to arena hub/i })
    ).toBeInTheDocument();
  });
});
