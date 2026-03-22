// Keep env parsing in one place so bad config fails fast instead of leaking into gameplay later.
import { config as loadDotEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The server can be started from the repo root or the workspace, so we try both env locations.
const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../../../.env")
];

for (const envPath of envCandidates) {
  loadDotEnv({ path: envPath, override: false });
}

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  MONGO_URI: z.string().min(1, "MONGO_URI cannot be empty.").optional(),
  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be at least 16 characters.")
    .optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const isProductionMode = parsed.data.NODE_ENV === "production";

if (isProductionMode && !parsed.data.MONGO_URI) {
  throw new Error(
    "Invalid environment configuration:\nMONGO_URI: MONGO_URI is required in production."
  );
}

if (isProductionMode && !parsed.data.SESSION_SECRET) {
  throw new Error(
    "Invalid environment configuration:\nSESSION_SECRET: SESSION_SECRET is required in production and must be at least 16 characters."
  );
}

export const config = {
  ...parsed.data,
  MONGO_URI: parsed.data.MONGO_URI ?? null,
  SESSION_SECRET: parsed.data.SESSION_SECRET ?? "dev-only-session-secret",
  // Local development still works without Docker, but the fallback is intentionally temporary.
  USE_IN_MEMORY_MONGO: !parsed.data.MONGO_URI && !isProductionMode
} as const;

export const isProduction = config.NODE_ENV === "production";
