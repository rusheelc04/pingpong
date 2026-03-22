// A short countdown gives new matches a cleaner start and stops players from moving before the room is ready.
interface CountdownOverlayProps {
  value: number | null;
  label?: string;
}

export function CountdownOverlay({
  value,
  label = "Serve incoming"
}: CountdownOverlayProps) {
  if (value === null) {
    return null;
  }

  return (
    <div className="countdown-overlay" aria-live="polite">
      <div className="countdown-chip">
        <span className="countdown-label">{label}</span>
        <strong>{value === 0 ? "GO!" : value}</strong>
      </div>
    </div>
  );
}
