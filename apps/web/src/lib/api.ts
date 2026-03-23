const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  "already-in-live-match": "You already have a live match in progress.",
  "unauthorized-match-access":
    "You do not have access to this match or replay.",
  "unauthorized-chat-access": "You cannot send chat in this match.",
  "maintenance-or-draining":
    "Matchmaking is temporarily unavailable while the server is draining.",
  "match-finalization-failed":
    "This match ended, but the server could not safely save the result."
};

export function formatAppError(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : null;

  if (!rawMessage) {
    return "Request failed.";
  }

  return FRIENDLY_ERROR_MESSAGES[rawMessage] ?? rawMessage;
}

// The frontend always sends cookies so the session stays consistent across fetches and sockets.
export async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  let body: unknown = {};

  if (text) {
    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: "The server sent invalid JSON." };
      }
    } else {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : text || "Request failed.";

    throw new Error(message);
  }

  return body as T;
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
