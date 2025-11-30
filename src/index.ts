import { env } from "./env";
import { cleanStaleTmp } from "@/utils";
import { connect } from "./db";
import { bot } from "./botInstance";
import "./bot";

const init = async (): Promise<void> => {
  try {
    await cleanStaleTmp();
    console.log(`Cleaned tmp`);
    await connect(env.MONGODB);
    await bot.launch();
    console.log("Bot started");
  } catch (e) {
    console.error(`Failed to init. Error: ${e}`);
    process.exit(1);
  }
};

init();
