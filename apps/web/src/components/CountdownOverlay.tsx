// The overlay treats each serve as a short staged sequence instead of a single pulsing chip.
import type { CountdownDisplayState } from "../lib/countdown";

interface CountdownOverlayProps {
  state?: CountdownDisplayState | null;
}

export function CountdownOverlay({ state }: CountdownOverlayProps) {
  if (!state) {
    return null;
  }

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={`countdown-overlay ${state.isExit ? "is-exit" : ""}`}
      data-countdown-phase={state.phase}
    >
      <div className="countdown-stage">
        <span className="countdown-label">{state.label}</span>
        <div
          className={`countdown-beat ${state.beat === "GO" ? "is-go" : ""}`}
          key={state.beatKey}
        >
          <strong>{state.beat}</strong>
        </div>
      </div>
    </div>
  );
}
