import Telegraf from "telegraf";
import { BotContext } from "./types";
import { env } from "./env";

const bot = new Telegraf<BotContext>(env.BOT_TOKEN, {
  telegram: {
    apiRoot: env.TELEGRAM_API,
  },
});

export { bot };
