import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, vi } from "vitest";

import type { LiveMatchState } from "@pingpong/shared";

import { MatchPage } from "./MatchPage";

const { mockNavigate, mockPongBoard, mockUseLiveMatchSession } = vi.hoisted(
  () => ({
    mockNavigate: vi.fn(),
    mockPongBoard: vi.fn(),
    mockUseLiveMatchSession: vi.fn()
  })
);

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");

  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock("../lib/use-live-match-session", () => ({
  useLiveMatchSession: mockUseLiveMatchSession
}));

vi.mock("../components/PongBoard", () => ({
  PongBoard: (props: { interactive: boolean }) => {
    mockPongBoard(props);
    return (
      <div
        data-interactive={String(props.interactive)}
        data-testid="pong-board"
      />
    );
  }
}));

vi.mock("../components/CountdownOverlay", () => ({
  CountdownOverlay: ({
    state
  }: {
    state?: { beat: number | string } | null;
  }) => (state ? <div data-testid="countdown-overlay">{state.beat}</div> : null)
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
  beforeEach(() => {
    mockNavigate.mockReset();
    mockPongBoard.mockReset();
    mockUseLiveMatchSession.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("keeps board input enabled once live play starts even while GO lingers", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-03-23T18:00:00.000Z");
    vi.setSystemTime(now);

    const liveState: LiveMatchState = {
      ball: { x: 500, y: 300, vx: 8, vy: 0 },
      countdownPhase: "opening-serve",
      matchId: "live-1",
      mode: "practice",
      paddles: { left: 240, right: 240 },
      pauseInfo: undefined,
      pausesLeft: { left: 2, right: 2 },
      players: {
        left: {
          displayName: "RefreshTester",
          rating: 1048,
          userId: "player-1"
        },
        right: {
          displayName: "Arcade Bot",
          isBot: true,
          rating: 1200,
          userId: "bot-1"
        }
      },
      ranked: false,
      roomCode: undefined,
      score: { left: 0, right: 0 },
      serverNowMs: now,
      startedAt: new Date(now).toISOString(),
      startsAt: new Date(now + 250).toISOString(),
      status: "prestart"
    };

    let sessionState = {
      error: null,
      finalizationFailed: false,
      liveState,
      loading: false,
      messages: [],
      playerRole: "left" as const,
      presence: { "bot-1": true, "player-1": true },
      reconnectDeadline: null,
      socket: null,
      summary: null
    };

    mockUseLiveMatchSession.mockImplementation(() => sessionState);

    const { rerender } = render(
      <MemoryRouter initialEntries={["/matches/live-1"]}>
        <Routes>
          <Route path="/matches/:matchId" element={<MatchPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("pong-board")).toHaveAttribute(
      "data-interactive",
      "false"
    );

    sessionState = {
      ...sessionState,
      liveState: {
        ...liveState,
        countdownPhase: undefined,
        serverNowMs: now + 260,
        startsAt: undefined,
        status: "live"
      }
    };

    act(() => {
      vi.setSystemTime(now + 260);
      rerender(
        <MemoryRouter initialEntries={["/matches/live-1"]}>
          <Routes>
            <Route path="/matches/:matchId" element={<MatchPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByTestId("countdown-overlay")).toHaveTextContent("GO");
    expect(screen.getByTestId("pong-board")).toHaveAttribute(
      "data-interactive",
      "true"
    );

    act(() => {
      vi.advanceTimersByTime(320);
    });

    expect(screen.queryByTestId("countdown-overlay")).not.toBeInTheDocument();
  });
});
