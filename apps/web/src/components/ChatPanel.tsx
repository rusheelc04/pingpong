// Chat stays simple on purpose: one panel for the log, one form for input, and enough polish to feel alive in a match.
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChatMessage, LiveMatchState } from "@pingpong/shared";
import type { Socket } from "socket.io-client";

import { formatAppError } from "../lib/api";

interface ChatPanelProps {
  matchId: string;
  messages: ChatMessage[];
  players?: LiveMatchState["players"] | null;
  socket: Socket | null;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

export function ChatPanel({
  matchId,
  messages,
  players,
  socket
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const logRef = useRef<HTMLDivElement | null>(null);

  const playerSideById = useMemo(() => {
    return {
      [players?.left.userId ?? ""]: "left",
      [players?.right.userId ?? ""]: "right"
    } as Record<string, "left" | "right">;
  }, [players]);

  useEffect(() => {
    if (!stickToBottom || !logRef.current) {
      return;
    }

    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages.length, stickToBottom]);

  useEffect(() => {
    if (!error) {
      return;
    }

    const timer = window.setTimeout(() => setError(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <section className="panel chat-panel">
      <div className="panel-header">
        <h3>Match Chat</h3>
      </div>
      <div
        className="chat-log"
        onScroll={() => {
          if (!logRef.current) {
            return;
          }

          const distanceFromBottom =
            logRef.current.scrollHeight -
            logRef.current.scrollTop -
            logRef.current.clientHeight;
          setStickToBottom(distanceFromBottom < 24);
        }}
        ref={logRef}
      >
        {messages.length === 0 ? (
          <p className="muted-copy">No messages yet. Keep it friendly.</p>
        ) : null}
        {messages.map((message) => {
          const side = playerSideById[message.senderId];

          return (
            <article className="chat-row" key={message.id}>
              <div className="chat-row-meta">
                <strong
                  className={
                    side ? `chat-author chat-author-${side}` : "chat-author"
                  }
                >
                  {message.senderName}
                </strong>
                <time className="chat-time" dateTime={message.createdAt}>
                  {formatTimestamp(message.createdAt)}
                </time>
              </div>
              <span>{message.body}</span>
            </article>
          );
        })}
      </div>
      <form
        className="chat-compose"
        onSubmit={(event) => {
          event.preventDefault();

          const body = draft.trim();
          if (!socket || !body || sending) {
            return;
          }

          setSending(true);
          setError(null);
          socket.emit(
            "chat:send",
            { matchId, body },
            (result: { ok: boolean; error?: string }) => {
              setSending(false);
              if (!result.ok) {
                setError(
                  formatAppError(result.error ?? "Could not send message.")
                );
                return;
              }

              setDraft("");
              setStickToBottom(true);
            }
          );
        }}
      >
        <input
          maxLength={240}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Say something sportsmanlike..."
          value={draft}
        />
        <button
          className="primary-button"
          disabled={!draft.trim() || sending}
          type="submit"
        >
          Send
        </button>
      </form>
      {error ? <p className="error-copy">{error}</p> : null}
    </section>
  );
}
