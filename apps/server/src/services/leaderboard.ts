import { MatchModel } from "../models/Match.js";

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
}

interface LeaderboardAggregateRow {
  _id: string;
  avatarUrl?: string | null;
  displayName: string;
  latestEndedAt: Date;
  losses: number;
  matchesPlayed: number;
  rating: number;
  wins: number;
}

export async function getRankedLeaderboard(limit = 25) {
  const rows = await MatchModel.aggregate<LeaderboardAggregateRow>([
    {
      $match: {
        ranked: true,
        status: "ended",
        "players.isBot": { $ne: true }
      }
    },
    {
      $sort: {
        endedAt: -1,
        _id: -1
      }
    },
    { $unwind: "$players" },
    {
      $match: {
        "players.isBot": { $ne: true }
      }
    },
    {
      $group: {
        _id: "$players.userId",
        avatarUrl: { $first: "$players.avatarUrl" },
        displayName: { $first: "$players.displayName" },
        latestEndedAt: { $first: "$endedAt" },
        losses: {
          $sum: {
            $cond: [{ $eq: ["$winnerId", "$players.userId"] }, 0, 1]
          }
        },
        matchesPlayed: { $sum: 1 },
        rating: { $first: "$players.ratingAfter" },
        wins: {
          $sum: {
            $cond: [{ $eq: ["$winnerId", "$players.userId"] }, 1, 0]
          }
        }
      }
    },
    {
      $sort: {
        rating: -1,
        wins: -1,
        matchesPlayed: -1,
        latestEndedAt: 1,
        _id: 1
      }
    },
    { $limit: limit }
  ]);

  return rows.map<LeaderboardEntry>((row, index) => ({
    rank: index + 1,
    userId: row._id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? null,
    rating: row.rating,
    wins: row.wins,
    losses: row.losses,
    matchesPlayed: row.matchesPlayed
  }));
}
