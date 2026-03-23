// The app prefers a real Mongo instance, but local work can fall back to an in-memory replica set when needed.
import type { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

import { config } from "./config.js";
import { logger } from "./logger.js";

let connected = false;
let mongoUri: string | null = null;
let memoryServer: MongoMemoryReplSet | null = null;
let transactionsAvailable = false;

export async function getMongoUri() {
  if (mongoUri) {
    return mongoUri;
  }

  if (config.MONGO_URI) {
    mongoUri = config.MONGO_URI;
    return mongoUri;
  }

  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  memoryServer = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      dbName: "ping-pong-arena-dev",
      storageEngine: "wiredTiger"
    }
  });
  mongoUri = memoryServer.getUri();
  logger.warn(
    "MONGO_URI is missing. Falling back to an ephemeral in-memory MongoDB replica set for temporary local development."
  );
  return mongoUri;
}

async function detectTransactionSupport() {
  if (!mongoose.connection.db) {
    transactionsAvailable = false;
    return;
  }

  let session: mongoose.mongo.ClientSession | null = null;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    await mongoose.connection.db.collection("__transaction_probe").insertOne(
      {
        _id: new mongoose.Types.ObjectId(),
        createdAt: new Date()
      },
      { session }
    );
    await session.abortTransaction();
    transactionsAvailable = true;
  } catch (error) {
    transactionsAvailable = false;
    logger.warn(
      { err: error },
      "Could not verify MongoDB transaction support."
    );
  } finally {
    await session?.endSession();
  }

  if (!transactionsAvailable) {
    logger.warn(
      "MongoDB transactions are unavailable on this connection. Non-production will use a sequential fallback for match finalization."
    );
  }
}

export async function connectToDatabase() {
  if (connected) {
    return;
  }

  await mongoose.connect(await getMongoUri());
  await detectTransactionSupport();
  connected = true;
  logger.info("Connected to MongoDB");
}

export function isDatabaseReady() {
  return connected && mongoose.connection.readyState === 1;
}

export function canUseTransactions() {
  return transactionsAvailable;
}

export async function disconnectFromDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (memoryServer) {
    await memoryServer.stop();
  }

  connected = false;
  mongoUri = null;
  memoryServer = null;
  transactionsAvailable = false;
}
