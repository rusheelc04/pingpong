// This wires the HTTP app together so the API, sessions, and static web bundle share one request pipeline.
import { fileURLToPath } from "node:url";
import path from "node:path";

import MongoStore from "connect-mongo";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import session from "express-session";
import helmet from "helmet";

import { config, isProduction } from "./config.js";
import { connectToDatabase, getMongoUri } from "./db.js";
import { logger } from "./logger.js";
import { createApiRouter } from "./routes/api.js";
import type { LiveMatchService } from "./services/liveMatchService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function allowRequestOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void
) {
  if (!origin || origin === config.CLIENT_URL) {
    callback(null, true);
    return;
  }

  if (!isProduction && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin ${origin} is not allowed in development.`));
}

export async function createApp(liveMatchService: LiveMatchService) {
  await connectToDatabase();
  const mongoUri = await getMongoUri();

  const app = express();
  app.set("trust proxy", isProduction ? 1 : 0);

  const sessionMiddleware = session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: mongoUri,
      collectionName: "sessions"
    }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  });

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(
    cors({
      origin: allowRequestOrigin,
      credentials: true
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(sessionMiddleware);
  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false
    }),
    createApiRouter(liveMatchService)
  );

  if (isProduction) {
    const webDist = path.resolve(__dirname, "../../web/dist");
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        return next();
      }
      return res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      void next;
      logger.error({ err: error }, "Unhandled request error.");
      res.status(500).json({ error: "Something went wrong on the server." });
    }
  );

  return { app, sessionMiddleware };
}
