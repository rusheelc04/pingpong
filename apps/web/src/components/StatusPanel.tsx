import type { ReactNode } from "react";

interface StatusPanelProps {
  eyebrow?: string;
  title: string;
  message?: ReactNode;
  actions?: ReactNode;
  tone?: "neutral" | "danger";
  headingLevel?: "h1" | "h2" | "h3";
}

export function StatusPanel({
  actions,
  eyebrow,
  headingLevel = "h2",
  message,
  title,
  tone = "neutral"
}: StatusPanelProps) {
  const Heading = headingLevel;

  return (
    <section
      className={`panel state-panel ${tone === "danger" ? "is-danger" : ""}`.trim()}
    >
      <div className="state-panel-copy">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <Heading>{title}</Heading>
        {message ? <p className="lead-copy">{message}</p> : null}
      </div>
      {actions ? <div className="state-panel-actions">{actions}</div> : null}
    </section>
  );
}
