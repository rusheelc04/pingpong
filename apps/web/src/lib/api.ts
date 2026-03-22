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
