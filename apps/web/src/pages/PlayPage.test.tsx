import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlayPage } from "./PlayPage";

const { mockUseAppContext } = vi.hoisted(() => ({
  mockUseAppContext: vi.fn()
}));

vi.mock("../lib/app-context", () => ({
  useAppContext: mockUseAppContext
}));

function createSocket() {
  const handlers = new Map<string, (payload: unknown) => void>();

  return {
    emit: vi.fn((event: string, payload?: unknown, callback?: unknown) => {
      if (event === "queue:join" && typeof callback === "function") {
        callback({ ok: false, error: "maintenance-or-draining" });
      }
    }),
    handlers,
    off: vi.fn((event: string) => {
      handlers.delete(event);
    }),
    on: vi.fn((event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
    })
  };
}

describe("PlayPage", () => {
  beforeEach(() => {
    mockUseAppContext.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("surfaces practice join errors from the direct warmup button", async () => {
    const user = userEvent.setup();
    const socket = createSocket();

    mockUseAppContext.mockReturnValue({
      activeMatchId: null,
      socket
    });

    render(
      <MemoryRouter>
        <PlayPage />
      </MemoryRouter>
    );

    await user.click(
      screen.getByRole("button", { name: /start practice match/i })
    );

    expect(
      await screen.findByText(
        /matchmaking is temporarily unavailable while the server is draining/i
      )
    ).toBeInTheDocument();
  });

  it("uses the same ack handling for the ranked queue practice offer", async () => {
    vi.useFakeTimers();
    const socket = createSocket();

    mockUseAppContext.mockReturnValue({
      activeMatchId: null,
      socket
    });

    render(
      <MemoryRouter>
        <PlayPage />
      </MemoryRouter>
    );

    const queueStatusHandler = socket.handlers.get("queue:status");
    if (!queueStatusHandler) {
      throw new Error("Expected PlayPage to register a queue status handler.");
    }

    await act(async () => {
      queueStatusHandler({
        queuePosition: 1,
        ratingWindow: 100,
        state: "searching",
        waitMs: 12_000
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(12_000);
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /no opponent yet\? start a bot match/i
      })
    );

    expect(socket.emit).toHaveBeenCalledWith("queue:leave");
    expect(
      screen.getByText(
        /matchmaking is temporarily unavailable while the server is draining/i
      )
    ).toBeInTheDocument();
  });
});
