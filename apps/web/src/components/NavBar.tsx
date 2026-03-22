// The nav keeps the primary paths visible and shows session-aware actions without pulling in page logic.
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAppContext } from "../lib/app-context";

export function NavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAppContext();

  return (
    <header className="top-bar">
      <Link className="brand-mark" to="/">
        Ping Pong Arena
      </Link>
      <nav className="top-nav">
        <Link
          className={
            location.pathname.startsWith("/leaderboard")
              ? "nav-active"
              : undefined
          }
          to="/leaderboard"
        >
          Leaderboard
        </Link>
        {user ? (
          <>
            <Link
              className={
                location.pathname.startsWith("/play") ? "nav-active" : undefined
              }
              to="/play"
            >
              Play
            </Link>
            <Link
              className={
                location.pathname.startsWith("/profile")
                  ? "nav-active"
                  : undefined
              }
              to="/profile"
            >
              Profile
            </Link>
            <button
              className="ghost-button"
              onClick={async () => {
                await logout();
                navigate("/");
              }}
              type="button"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link className="ghost-button" to="/">
            Play as Guest
          </Link>
        )}
      </nav>
    </header>
  );
}
