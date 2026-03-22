import { Suspense, lazy, type ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { NavBar } from "./components/NavBar";
import { useAppContext } from "./lib/app-context";

const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((module) => ({
    default: module.LandingPage
  }))
);
const LeaderboardPage = lazy(() =>
  import("./pages/LeaderboardPage").then((module) => ({
    default: module.LeaderboardPage
  }))
);
const MatchPage = lazy(() =>
  import("./pages/MatchPage").then((module) => ({
    default: module.MatchPage
  }))
);
const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((module) => ({
    default: module.NotFoundPage
  }))
);
const PlayPage = lazy(() =>
  import("./pages/PlayPage").then((module) => ({
    default: module.PlayPage
  }))
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((module) => ({
    default: module.ProfilePage
  }))
);
const ReplayPage = lazy(() =>
  import("./pages/ReplayPage").then((module) => ({
    default: module.ReplayPage
  }))
);
const RoomPage = lazy(() =>
  import("./pages/RoomPage").then((module) => ({
    default: module.RoomPage
  }))
);

function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, loading } = useAppContext();
  if (loading) {
    return <div className="page-shell">Loading Arena...</div>;
  }
  return user ? children : <Navigate to="/" replace />;
}

function RouteFallback() {
  return <div className="page-shell">Loading Arena...</div>;
}

export default function App() {
  return (
    <div className="app-shell">
      <NavBar />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/play"
            element={
              <ProtectedRoute>
                <PlayPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rooms/:code"
            element={
              <ProtectedRoute>
                <RoomPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/matches/:matchId"
            element={
              <ProtectedRoute>
                <MatchPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/replays/:matchId"
            element={
              <ProtectedRoute>
                <ReplayPage />
              </ProtectedRoute>
            }
          />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}
