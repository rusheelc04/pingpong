export const SMOKE_TEST_DISPLAY_NAME_PREFIXES = [
  "RenderSmoke",
  "DebugSmoke",
  "RankedA",
  "RankedB"
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDisplayNameFilter(prefixes) {
  return {
    $or: prefixes.map((prefix) => ({
      displayName: { $regex: `^${escapeRegex(prefix)}` }
    }))
  };
}

export async function findSmokeTestArtifacts(
  { MatchModel, MessageModel, UserModel },
  prefixes = SMOKE_TEST_DISPLAY_NAME_PREFIXES
) {
  const users = await UserModel.find(buildDisplayNameFilter(prefixes))
    .sort({ createdAt: 1 })
    .lean();
  const userIds = users.map((user) => String(user._id));

  if (userIds.length === 0) {
    return {
      matchIds: [],
      matches: [],
      messageCount: 0,
      userIds,
      users
    };
  }

  const matches = await MatchModel.find({
    "players.userId": { $in: userIds }
  })
    .sort({ startedAt: 1 })
    .lean();
  const matchIds = matches.map((match) => String(match._id));
  const messageCount =
    matchIds.length > 0
      ? await MessageModel.countDocuments({ matchId: { $in: matchIds } })
      : 0;

  return {
    matchIds,
    matches,
    messageCount,
    userIds,
    users
  };
}

export async function cleanupSmokeTestArtifacts(
  models,
  prefixes = SMOKE_TEST_DISPLAY_NAME_PREFIXES
) {
  const artifacts = await findSmokeTestArtifacts(models, prefixes);

  if (artifacts.userIds.length === 0) {
    return {
      deletedMatchCount: 0,
      deletedMessageCount: 0,
      deletedUserCount: 0,
      ...artifacts
    };
  }

  const [messageDelete, matchDelete, userDelete] = await Promise.all([
    artifacts.matchIds.length > 0
      ? models.MessageModel.deleteMany({ matchId: { $in: artifacts.matchIds } })
      : Promise.resolve({ deletedCount: 0 }),
    models.MatchModel.deleteMany({
      _id: { $in: artifacts.matchIds }
    }),
    models.UserModel.deleteMany({ _id: { $in: artifacts.userIds } })
  ]);

  return {
    deletedMatchCount: matchDelete.deletedCount ?? 0,
    deletedMessageCount: messageDelete.deletedCount ?? 0,
    deletedUserCount: userDelete.deletedCount ?? 0,
    ...artifacts
  };
}
