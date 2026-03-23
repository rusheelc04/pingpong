// The entrypoint owns startup and shutdown so the backend can exit cleanly in dev, tests, and production.
import { createServer } from "node:http";

import { createApp } from "./app.js";
import { config } from "./config.js";
import { disconnectFromDatabase } from "./db.js";
import { logger } from "./logger.js";
import { LiveMatchService } from "./services/liveMatchService.js";
import { initializeSocket } from "./socket/index.js";

const LISTEN_RETRY_DELAY_MS = 750;
const LISTEN_RETRY_ATTEMPTS = 5;

async function listenWithRetry(
  server: ReturnType<typeof createServer>,
  port: number,
  retriesLeft = LISTEN_RETRY_ATTEMPTS
) {
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: NodeJS.ErrnoException) => {
      server.off("listening", handleListening);

      if (error.code === "EADDRINUSE" && retriesLeft > 0) {
        logger.warn(
          `Port ${port} is temporarily busy. Retrying in ${LISTEN_RETRY_DELAY_MS}ms (${retriesLeft} attempts left).`
        );
        server.off("error", handleError);
        setTimeout(() => {
          void listenWithRetry(server, port, retriesLeft - 1)
            .then(resolve)
            .catch(reject);
        }, LISTEN_RETRY_DELAY_MS);
        return;
      }

      server.off("error", handleError);
      reject(error);
    };

    const handleListening = () => {
      server.off("error", handleError);
      resolve();
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port);
  });
}

function closeHttpServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function main() {
  const liveMatchService = new LiveMatchService();
  const { app, sessionMiddleware } = await createApp(liveMatchService);
  const server = createServer(app);
  const io = initializeSocket(server, app, sessionMiddleware, liveMatchService);
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    liveMatchService.beginDrain();
    const drainSnapshot = liveMatchService.getDrainSnapshot();
    logger.info(
      `${signal} received. Closing live matches and network listeners.`
    );
    if (drainSnapshot.length > 0) {
      logger.warn(
        { activeMatches: drainSnapshot },
        "Shutdown interrupted live matches."
      );
    }
    liveMatchService.dispose();
    io.close();
    await Promise.allSettled([
      closeHttpServer(server),
      disconnectFromDatabase()
    ]);
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal).finally(() => process.exit(0));
    });
  }

  await listenWithRetry(server, config.PORT);
  logger.info(
    `Ping Pong Arena server listening on http://localhost:${config.PORT}`
  );
}

main().catch((error) => {
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
    logger.error(
      `Port ${config.PORT} is already in use. Stop the existing dev server or change PORT.`
    );
  } else {
    logger.error(error);
  }
  process.exit(1);
});
