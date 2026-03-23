import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createCountdownDisplayState } from "../lib/countdown";
import { CountdownOverlay } from "./CountdownOverlay";

describe("CountdownOverlay", () => {
  it("renders the correct beat and label for the opening serve", () => {
    render(
      <CountdownOverlay
        state={createCountdownDisplayState({
          beat: 3,
          phase: "opening-serve",
          sequenceKey: "opening-serve:2026-03-23T18:00:03.000Z"
        })}
      />
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/match starts/i)).toBeInTheDocument();
  });

  it("renders a point-reset GO state without dropping the overlay", () => {
    const { container } = render(
      <CountdownOverlay
        state={createCountdownDisplayState({
          beat: "GO",
          isExit: true,
          phase: "point-reset",
          sequenceKey: "point-reset:2026-03-23T18:00:06.000Z"
        })}
      />
    );

    expect(screen.getByText("GO")).toBeInTheDocument();
    expect(screen.getByText(/next serve/i)).toBeInTheDocument();
    expect(
      container.querySelector(".countdown-overlay.is-exit")
    ).not.toBeNull();
  });
});
