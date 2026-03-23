import process from "node:process";

import mongoose from "mongoose";

import { cleanupSmokeTestArtifacts } from "./lib/smoke-cleanup.mjs";

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  throw new Error("MONGO_URI is required to clean smoke test data.");
}

const userSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true }
  },
  { collection: "users", strict: false }
);

const matchSchema = new mongoose.Schema(
  {},
  { collection: "matches", strict: false }
);

const messageSchema = new mongoose.Schema(
  {},
  { collection: "messages", strict: false }
);

const UserModel = mongoose.model("SmokeCleanupUser", userSchema);
const MatchModel = mongoose.model("SmokeCleanupMatch", matchSchema);
const MessageModel = mongoose.model("SmokeCleanupMessage", messageSchema);

try {
  await mongoose.connect(mongoUri);

  const summary = await cleanupSmokeTestArtifacts({
    MatchModel,
    MessageModel,
    UserModel
  });

  console.log(
    JSON.stringify(
      {
        deletedMatchCount: summary.deletedMatchCount,
        deletedMessageCount: summary.deletedMessageCount,
        deletedUserCount: summary.deletedUserCount,
        matchedDisplayNames: summary.users.map((user) => user.displayName)
      },
      null,
      2
    )
  );
} finally {
  await mongoose.disconnect();
}
