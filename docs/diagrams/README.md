# Diagram Sources

These Mermaid files are the editable source for the architecture diagrams used in the README and the broader docs set.

- `monorepo-overview.mmd` shows the repo layout and the major runtime boundaries.
- `session-request-flow.mmd` shows how guest auth, cookies, and the initial page bootstrap fit together.
- `socket-match-flow.mmd` shows the real-time loop from queue join to match end.
- `match-lifecycle.mmd` shows the state changes for live matches.
- `replay-history-flow.mmd` shows how finished matches become history pages and replay timelines.
- `deployment-topology.mmd` shows the local-dev and production hosting shapes.

When a diagram changes, update the matching Mermaid block in the root `README.md` so the overview stays in sync.
