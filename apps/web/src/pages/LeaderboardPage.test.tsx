import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LeaderboardPage } from "./LeaderboardPage";

const { mockApiFetch, mockIsAbortError } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockIsAbortError: vi.fn(() => false)
}));

vi.mock("../lib/api", () => ({
  apiFetch: mockApiFetch,
  isAbortError: mockIsAbortError
}));

describe("LeaderboardPage", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockIsAbortError.mockReset();
    mockIsAbortError.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a single ranked-only ladder without a provisional section", async () => {
    mockApiFetch.mockResolvedValue({
      leaderboard: [
        {
          rank: 1,
          userId: "ace",
          displayName: "Ace",
          rating: 1016,
          wins: 1,
          losses: 0,
          matchesPlayed: 1
        }
      ]
    });

    render(
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(
        screen.getByText(/only ranked human-vs-human results count/i)
      ).toBeInTheDocument()
    );

    expect(screen.getByText("Ace")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /new players/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /joined the arena but do not have completed results yet/i
      )
    ).not.toBeInTheDocument();
  });
});
