// Keeping a real 404 page makes the app feel intentional instead of leaving stray routes to chance.
import { Link } from "react-router-dom";

import { StatusPanel } from "../components/StatusPanel";

export function NotFoundPage() {
  return (
    <main className="page-shell page-stack">
      <StatusPanel
        actions={
          <>
            <Link className="primary-button" to="/">
              Back Home
            </Link>
            <Link className="ghost-button" to="/play">
              Arena Hub
            </Link>
          </>
        }
        eyebrow="404"
        headingLevel="h1"
        message="The link is probably out of date, or the page never existed in this build."
        title="That page is not in this arena."
      />
    </main>
  );
}
