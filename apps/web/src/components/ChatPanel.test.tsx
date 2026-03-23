import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Socket } from "socket.io-client";

import { ChatPanel } from "./ChatPanel";

describe("ChatPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-clears transient send errors after five seconds", () => {
    const socket = {
      emit: vi.fn(
        (
          _event: string,
          _payload: unknown,
          callback?: (result: { ok: boolean; error?: string }) => void
        ) => {
          callback?.({
            ok: false,
            error: "You are sending messages too quickly."
          });
        }
      )
    } as unknown as Socket;

    render(
      <ChatPanel
        matchId="match-1"
        messages={[]}
        players={null}
        socket={socket}
      />
    );

    fireEvent.change(
      screen.getByPlaceholderText(/say something sportsmanlike/i),
      {
        target: { value: "hello there" }
      }
    );
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(
      screen.getByText(/you are sending messages too quickly/i)
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(
      screen.queryByText(/you are sending messages too quickly/i)
    ).not.toBeInTheDocument();
  });
});
