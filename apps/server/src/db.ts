// The app prefers a real Mongo instance, but local work can fall back to an in-memory server when needed.
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

import { config } from "./config.js";
import { logger } from "./logger.js";

let connected = false;
let mongoUri: string | null = null;
let memoryServer: MongoMemoryServer | null = null;

export async function getMongoUri() {
  if (mongoUri) {
    return mongoUri;
  }

  if (config.MONGO_URI) {
    mongoUri = config.MONGO_URI;
    return mongoUri;
  }

  memoryServer = await MongoMemoryServer.create({
    instance: {
      dbName: "ping-pong-arena-dev"
    }
  });
  mongoUri = memoryServer.getUri();
  logger.warn(
    "MONGO_URI is missing. Falling back to an ephemeral in-memory MongoDB instance for temporary local development."
  );
  return mongoUri;
}

export async function connectToDatabase() {
  if (connected) {
    return;
  }

  await mongoose.connect(await getMongoUri());
  connected = true;
  logger.info("Connected to MongoDB");
}

export function isDatabaseReady() {
  return connected && mongoose.connection.readyState === 1;
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
}
