import { logger } from "../logger.js";
import { MatchModel } from "../models/Match.js";
import { MessageModel } from "../models/Message.js";

export async function cleanupStaleLiveMatches() {
  const staleMatches = await MatchModel.find({ status: "live" })
    .select({ _id: 1 })
    .lean();

  if (staleMatches.length === 0) {
    return {
      deletedMatches: 0,
      deletedMessages: 0
    };
  }

  const staleMatchIds = staleMatches.map((match) => String(match._id));
  const [matchResult, messageResult] = await Promise.all([
    MatchModel.deleteMany({ _id: { $in: staleMatchIds } }),
    MessageModel.deleteMany({ matchId: { $in: staleMatchIds } })
  ]);

  logger.warn(
    {
      staleMatchIds,
      deletedMatches: matchResult.deletedCount ?? 0,
      deletedMessages: messageResult.deletedCount ?? 0
    },
    "Cleaned stale live match rows left behind by a previous server process."
  );

  return {
    deletedMatches: matchResult.deletedCount ?? 0,
    deletedMessages: messageResult.deletedCount ?? 0
  };
}
