// This keeps the history view honest so live matches do not quietly show up as finished results again.
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { ProfilePage } from "./ProfilePage";

const { mockApiFetch } = vi.hoisted(() => ({
  mockApiFetch: vi.fn()
}));

vi.mock("../lib/api", () => ({
  apiFetch: mockApiFetch,
  isAbortError: () => false
}));

vi.mock("../lib/app-context", () => ({
  useAppContext: () => ({
    activeMatchId: "match-live",
    user: {
      userId: "player-1",
      displayName: "PlanAudit",
      rating: 1042,
      provider: "guest"
    }
  })
}));

describe("ProfilePage", () => {
  it("shows the active match separately from completed history", async () => {
    mockApiFetch.mockResolvedValueOnce({
      matches: [
        {
          id: "ended-1",
          mode: "practice",
          ranked: false,
          status: "ended",
          score: { left: 11, right: 7 },
          players: [],
          winnerId: "player-1",
          winnerName: "PlanAudit",
          endedBy: "score",
          startedAt: "2026-03-20T01:00:00.000Z",
          endedAt: "2026-03-20T01:05:00.000Z",
          stats: {
            rallyCount: 12,
            longestRally: 6,
            paddleHits: 24,
            maxBallSpeed: 12,
            durationSeconds: 300
          },
          replayAvailable: true,
          isLive: false
        }
      ]
    });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /rejoin match/i })).toHaveAttribute(
      "href",
      "/matches/match-live"
    );

    await waitFor(() => {
      expect(screen.getByText(/^Completed Matches$/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/^win$/i)).toBeInTheDocument();
    expect(screen.queryByText(/^finished$/i)).not.toBeInTheDocument();
  });
});
