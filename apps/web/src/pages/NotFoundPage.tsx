// Keeping a real 404 page makes the app feel intentional instead of leaving stray routes to chance.
import { Link } from "react-router-dom";
export function NotFoundPage() {
  return (
    <main className="page-shell page-stack">
      <section className="panel">
        <span className="eyebrow">404</span>
        <h1>That page is not in this arena.</h1>
        <p className="lead-copy">
          The link is probably out of date, or the page never existed in this
          build.
        </p>
        <div className="hero-actions">
          <Link className="primary-button" to="/">
            Back Home
          </Link>
          <Link className="ghost-button" to="/play">
            Arena Hub
          </Link>
        </div>
      </section>
    </main>
  );
}
