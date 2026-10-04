import dotenv from "dotenv";
import { parseUserIds } from "./messagePolicy";

dotenv.config();

const REQUIRED_VARS = ["BOT_TOKEN"] as const;

const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`
  );
}

export const env = {
  BOT_TOKEN: process.env.BOT_TOKEN!,
  ADMIN_USER_IDS: parseUserIds(process.env.ADMIN_USER_IDS),
  MULTI_URL_USER_IDS: parseUserIds(process.env.MULTI_URL_USER_IDS),
  TELEGRAM_API: process.env.TELEGRAM_API ?? "https://api.telegram.org",
  THREADS: parseInt(process.env.THREADS || "2"),
  API_SIZE_LIMIT_MB: parseInt(process.env.API_SIZE_LIMIT_MB || "50"),
  CACHE_DB_PATH: process.env.CACHE_DB_PATH || "data/cache.db",
};
