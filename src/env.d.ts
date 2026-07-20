declare namespace NodeJS {
  interface ProcessEnv {
    BOT_TOKEN: string;
    TELEGRAM_API?: string;
    THREADS?: string;
    API_SIZE_LIMIT_MB: string;
    CACHE_DB_PATH?: string;
  }
}
