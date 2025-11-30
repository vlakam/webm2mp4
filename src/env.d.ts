declare namespace NodeJS {
  interface ProcessEnv {
    BOT_TOKEN: string;
    MONGODB: string;
    TELEGRAM_API?: string;
    THREADS?: string;
    MONGODB_TIMEOUT?: string;
    API_SIZE_LIMIT_MB: string;
  }
}
