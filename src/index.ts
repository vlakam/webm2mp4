import { env } from "./env";
import { cleanStaleTmp } from "@/utils";
import { i18n } from "@/middlewares";
import { bot } from "./botInstance";
import { videoCache } from "@/cache/videoCache";
import "./bot";

const init = async (): Promise<void> => {
  try {
    await cleanStaleTmp();
    console.log(`Cleaned tmp`);
    await i18n.ready;
    await videoCache.ready;
    await bot.launch();
    console.log("Bot started");
  } catch (e) {
    console.error(`Failed to init. Error: ${e}`);
    process.exit(1);
  }
};

init();
