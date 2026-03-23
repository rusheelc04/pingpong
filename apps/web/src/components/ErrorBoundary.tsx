// This catches render-time crashes so a bad component does not blank the whole app.
import { Component, type ErrorInfo, type ReactNode } from "react";

import { StatusPanel } from "./StatusPanel";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// This keeps a bad render from taking out the whole app.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="page-shell page-stack">
          <StatusPanel
            eyebrow="Something broke"
            headingLevel="h1"
            message="Refresh the page to reset the current session state."
            title="The arena hit an unexpected error."
            tone="danger"
          />
        </main>
      );
    }

    return this.props.children;
  }
}
