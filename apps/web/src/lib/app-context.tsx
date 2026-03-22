// App context owns the session bootstrap and the one shared socket connection for the signed-in browser.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { PropsWithChildren } from "react";

import type { SessionUser } from "@pingpong/shared";
import { io, type Socket } from "socket.io-client";

import { apiFetch, isAbortError } from "./api";

interface SessionResponse {
  user: SessionUser | null;
  activeMatchId?: string | null;
}

interface AppContextValue {
  user: SessionUser | null;
  activeMatchId: string | null;
  loading: boolean;
  socket: Socket | null;
  refreshSession: () => Promise<void>;
  loginAsGuest: (displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Session refresh is reused after login, logout, and match completion.
  const loadSession = useCallback(async (signal?: AbortSignal) => {
    const result = await apiFetch<SessionResponse>("/api/me", { signal });
    setUser(result.user);
    setActiveMatchId(result.activeMatchId ?? null);
  }, []);

  const refreshSession = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  useEffect(() => {
    const controller = new AbortController();

    loadSession(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isAbortError(error)) {
          setUser(null);
          setActiveMatchId(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [loadSession]);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      return;
    }

    const socket = io({
      withCredentials: true,
      autoConnect: true
    });
    socketRef.current = socket;
    setSocket(socket);

    const handleMatchLink = (payload: { matchId: string }) => {
      setActiveMatchId(payload.matchId);
    };
    const handleMatchEnd = () => {
      setActiveMatchId(null);
      void refreshSession();
    };

    socket.on("match:found", handleMatchLink);
    socket.on("match:start", handleMatchLink);
    socket.on("match:end", handleMatchEnd);

    return () => {
      socket.off("match:found", handleMatchLink);
      socket.off("match:start", handleMatchLink);
      socket.off("match:end", handleMatchEnd);
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [refreshSession, user]);

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      activeMatchId,
      loading,
      socket,
      refreshSession,
      loginAsGuest: async (displayName: string) => {
        const result = await apiFetch<{ user: SessionUser }>(
          "/api/auth/guest",
          {
            method: "POST",
            body: JSON.stringify({ displayName })
          }
        );
        setUser(result.user);
        await refreshSession();
      },
      logout: async () => {
        await apiFetch<{ success: true }>("/api/auth/logout", {
          method: "POST"
        });
        setUser(null);
        setActiveMatchId(null);
      }
    }),
    [activeMatchId, loading, refreshSession, socket, user]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used inside AppProvider.");
  }
  return context;
}
