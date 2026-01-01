import { session } from "telegraf";
import { SizeError } from "./error";
import { i18n } from "./middlewares";
import { BaseJob, BotContext } from "./types";
import { bot } from "./botInstance";
import { createDownloadJob, downloadQ } from "./jobs/downloadQueue";
import { isAbsolute } from "path";
import { env } from "./env";
import { editJobMessageText } from "@/utils";

bot.use(session());
bot.start((ctx) =>
  ctx
    .reply(i18n.t(i18n.getLocale(ctx), "common.start"))
    .catch((e) => console.error(`/start reply failed: ${e}`))
);

const enqueueDownload = async (ctx: BotContext, url: string): Promise<void> => {
  const position = downloadQ.size + downloadQ.pending + 1;
  const locale = i18n.getLocale(ctx);
  const message = await ctx.reply(i18n.t(locale, "download_start"), {
    reply_to_message_id: ctx.message!.message_id,
  });

  createDownloadJob({
    chatId: ctx.chat!.id,
    messageId: ctx.message!.message_id,
    messageToEdit: message.message_id,
    url,
    cookies: ctx.session.cookie,
    locale,
  });

  if (position > 1) {
    const job: BaseJob = {
      chatId: message.chat.id,
      messageId: message.message_id,
      messageToEdit: message.message_id,
      locale,
    };
    await editJobMessageText(
      job,
      i18n.t(locale, "queue.in_queue", { position, length: position }),
      { parse_mode: "HTML", disable_web_page_preview: true }
    );
  }
};

bot.url(/.+/, async (ctx: BotContext) => {
  const urls = ctx
    .message!.entities!.filter(({ type }) => type === "url")
    .slice(0, 1)
    .map(({ offset, length }) =>
      ctx.message!.text!.substring(offset, offset + length)
    );

  if (!urls[0]) return;
  await enqueueDownload(ctx, urls[0]);
});

bot.on("document", async (ctx: BotContext) => {
  if (!ctx.message || !ctx.message.document) return;
  
  if (
    !ctx.message!.document!.mime_type ||
    !ctx.message!.document!.mime_type.startsWith("video")
  ) {
    return ctx.reply(
      i18n.t(i18n.getLocale(ctx), "download_document.error.not_a_video"),
      {
        reply_to_message_id: ctx.message!.message_id,
        parse_mode: "HTML",
      }
    );
  }

  try {
    const file = await ctx.telegram.getFile(ctx.message.document.file_id);
    let url = "";
    if (file.file_path && isAbsolute(file.file_path)) {
      const match = file.file_path.match(/\/file\/.*$/);
      const result = match ? match[0] : "";
      url = `${env.TELEGRAM_API}${result}`;
    } else {
      url = `${env.TELEGRAM_API}/file/bot${env.BOT_TOKEN}/${file.file_path}`;
    }

    await enqueueDownload(ctx, url);
  } catch (e: any) {
    if (e.message.includes("file is too big")) {
      throw new SizeError();
    } else {
      throw e;
    }
  }
});

bot.on("video", async (ctx: BotContext) => {
  if (!ctx.message || !ctx.message.video) return;

  try {
    const file = await ctx.telegram.getFile(ctx.message.video.file_id);
    let url = "";
    if (file.file_path && isAbsolute(file.file_path)) {
      const match = file.file_path.match(/\/file\/.*$/);
      const result = match ? match[0] : "";
      url = `${env.TELEGRAM_API}${result}`;
    } else {
      url = `${env.TELEGRAM_API}/file/bot${env.BOT_TOKEN}/${file.file_path}`;
    }

    await enqueueDownload(ctx, url);
  } catch (e: any) {
    if (e.message.includes("file is too big")) {
      throw new SizeError();
    } else {
      throw e;
    }
  }
});

bot.hears(/setcookie (.+)/, (ctx: BotContext) => {
  const match = ctx.match as RegExpExecArray;
  ctx.session.cookie = match[1];
  ctx.reply(i18n.t(i18n.getLocale(ctx), "cookies", { cookie: match[1] }));
});

bot.catch((err: Error) => {
  console.error(`Bot error`, err);
});