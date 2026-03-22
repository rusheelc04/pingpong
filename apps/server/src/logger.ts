// Pretty logs are only for local eyes, so production keeps the raw structured output.
import pino from "pino";

import { isProduction } from "./config.js";

// Pretty logs are handy in dev, but production stays on plain JSON for log shipping.
export const logger = pino({
  level: isProduction ? "info" : "debug",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard"
        }
      }
});
