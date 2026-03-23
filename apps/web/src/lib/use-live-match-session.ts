import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ChatMessage,
  LiveMatchState,
  MatchFinalizationErrorPayload,
  MatchReconnectWindowPayload,
  MatchSummary,
  PresenceUpdatePayload,
  PlayerSide
} from "@pingpong/shared";

import { apiFetch, formatAppError, isAbortError } from "./api";
import { useAppContext } from "./app-context";

interface MatchResponse {
  match: MatchSummary | null;
  liveState: LiveMatchState | null;
  messages: ChatMessage[];
}

function getInitialPresence(state: LiveMatchState | null) {
  if (!state) {
    return {};
  }

  return {
    [state.players.left.userId]: true,
    [state.players.right.userId]: true
  };
}

export function useLiveMatchSession(matchId: string) {
  const { socket, user } = useAppContext();
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [liveState, setLiveState] = useState<LiveMatchState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [finalizationFailed, setFinalizationFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reconnectDeadline, setReconnectDeadline] = useState<string | null>(
    null
  );
  const [shouldResume, setShouldResume] = useState(false);
  const resumeAttemptedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    resumeAttemptedRef.current = false;
    setLoading(true);
    setError(null);
    setFinalizationFailed(false);
    setReconnectDeadline(null);
    setSummary(null);
    setLiveState(null);
    setMessages([]);
    setPresence({});
    setShouldResume(false);

    apiFetch<MatchResponse>(`/api/matches/${matchId}`, {
      signal: controller.signal
    })
      .then((result) => {
        setSummary(result.match);
        setMessages(result.messages);
        setLiveState(result.liveState);
        setPresence(getInitialPresence(result.liveState));
        setFinalizationFailed(false);
        setShouldResume(Boolean(result.liveState));
      })
      .catch((requestError: unknown) => {
        if (!isAbortError(requestError)) {
          setError(formatAppError(requestError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [matchId]);

  useEffect(() => {
    if (!socket || !shouldResume || resumeAttemptedRef.current) {
      return;
    }

    resumeAttemptedRef.current = true;
    socket.emit(
      "match:resume",
      { matchId },
      (result: { ok: boolean; state?: LiveMatchState; error?: string }) => {
        if (result.ok && result.state) {
          setLiveState(result.state);
          setPresence(getInitialPresence(result.state));
          setError(null);
          setFinalizationFailed(false);
          return;
        }

        if (
          !summary &&
          result.error &&
          result.error !== "Match is no longer live."
        ) {
          setError(formatAppError(result.error));
        }
      }
    );
  }, [matchId, shouldResume, socket, summary]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleLiveState = (payload: LiveMatchState) => {
      if (payload.matchId !== matchId) {
        return;
      }

      setLiveState(payload);
      setPresence((current) => ({
        [payload.players.left.userId]:
          current[payload.players.left.userId] ?? true,
        [payload.players.right.userId]:
          current[payload.players.right.userId] ?? true
      }));
      setError(null);
      setFinalizationFailed(false);
    };

    const handleChat = (payload: ChatMessage) => {
      if (payload.matchId === matchId) {
        setMessages((current) => [...current, payload]);
      }
    };

    const handlePresence = (payload: PresenceUpdatePayload) => {
      if (payload.matchId === matchId) {
        setPresence({
          [payload.players.left.userId]: payload.players.left.connected,
          [payload.players.right.userId]: payload.players.right.connected
        });
      }
    };

    const handleReconnect = (payload: MatchReconnectWindowPayload) => {
      if (payload.matchId === matchId) {
        setReconnectDeadline(payload.reconnectDeadline);
      }
    };

    const handleEnd = (payload: { summary: MatchSummary }) => {
      if (payload.summary.id !== matchId) {
        return;
      }

      setSummary(payload.summary);
      setLiveState(null);
      setReconnectDeadline(null);
      setShouldResume(false);
      setError(null);
      setFinalizationFailed(false);
    };

    const handleFinalizationError = (
      payload: MatchFinalizationErrorPayload
    ) => {
      if (payload.matchId !== matchId) {
        return;
      }

      setSummary(null);
      setLiveState(null);
      setReconnectDeadline(null);
      setShouldResume(false);
      setPresence({});
      setFinalizationFailed(true);
      setError(formatAppError(payload.error));
    };

    socket.on("state:snapshot", handleLiveState);
    socket.on("match:start", handleLiveState);
    socket.on("chat:message", handleChat);
    socket.on("presence:update", handlePresence);
    socket.on("match:reconnect-window", handleReconnect);
    socket.on("match:end", handleEnd);
    socket.on("match:finalization-error", handleFinalizationError);

    return () => {
      socket.off("state:snapshot", handleLiveState);
      socket.off("match:start", handleLiveState);
      socket.off("chat:message", handleChat);
      socket.off("presence:update", handlePresence);
      socket.off("match:reconnect-window", handleReconnect);
      socket.off("match:end", handleEnd);
      socket.off("match:finalization-error", handleFinalizationError);
    };
  }, [matchId, socket]);

  useEffect(() => {
    if (liveState?.status !== "paused") {
      setReconnectDeadline(null);
    }
  }, [liveState?.status]);

  const playerRole = useMemo<PlayerSide | "spectator">(() => {
    if (!liveState || !user) {
      return "spectator";
    }

    if (liveState.players.left.userId === user.userId) {
      return "left";
    }

    if (liveState.players.right.userId === user.userId) {
      return "right";
    }

    return "spectator";
  }, [liveState, user]);

  return {
    error,
    finalizationFailed,
    liveState,
    loading,
    messages,
    playerRole,
    presence,
    reconnectDeadline,
    setMessages,
    socket,
    summary
  };
}
