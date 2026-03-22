// Queue helpers stay small on purpose so matchmaking rules are easy to tweak without touching the game loop.
import type { QueueSearchingStatus, QueueTicket } from "@pingpong/shared";

export function getQueueWindow(enqueuedAt: number) {
  const expansions = Math.floor((Date.now() - enqueuedAt) / 5000);
  return Math.min(300, 100 + expansions * 25);
}

export function removeFromQueue(queue: QueueTicket[], userId: string) {
  return queue.filter((ticket) => ticket.userId !== userId);
}

export function serializeQueueStatus(
  queue: QueueTicket[],
  ticket: QueueTicket
): QueueSearchingStatus {
  return {
    state: "searching",
    queuePosition:
      queue.findIndex((entry) => entry.userId === ticket.userId) + 1,
    waitMs: Date.now() - ticket.enqueuedAt,
    ratingWindow: getQueueWindow(ticket.enqueuedAt)
  };
}
