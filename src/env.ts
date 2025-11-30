import dotenv from "dotenv";

dotenv.config();

const REQUIRED_VARS = ["BOT_TOKEN", "MONGODB"] as const;

const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`
  );
}

export const env = {
  BOT_TOKEN: process.env.BOT_TOKEN!,
  MONGODB: process.env.MONGODB || "mongodb://mongo:27017/videos",
  TELEGRAM_API: process.env.TELEGRAM_API ?? "https://api.telegram.org",
  THREADS: parseInt(process.env.THREADS || "2"),
  MONGODB_TIMEOUT: parseInt(process.env.MONGODB_TIMEOUT || "10000"),
  API_SIZE_LIMIT_MB: parseInt(process.env.API_SIZE_LIMIT_MB || "50"),
};
