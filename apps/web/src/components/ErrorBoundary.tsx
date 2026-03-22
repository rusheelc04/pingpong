// This catches render-time crashes so a bad component does not blank the whole app.
import { Component, type ErrorInfo, type ReactNode } from "react";

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
          <section className="panel">
            <span className="eyebrow">Something broke</span>
            <h1>The arena hit an unexpected error.</h1>
            <p className="lead-copy">
              Refresh the page to reset the current session state.
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
