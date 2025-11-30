import { Middleware, session } from "telegraf";
import { SizeError } from "./error";
import { errorMiddleware, i18n } from "./middlewares";
import { BotContext } from "./types";
import { bot } from "./botInstance";
import { createDownloadJob, downloadQ } from "./jobs/downloadQueue";
import { isAbsolute } from "path";
import { env } from "./env";

bot.use(errorMiddleware as Middleware<BotContext>);
bot.use(session());
bot.use(i18n.middleware());
bot.start(({ reply, i18n }) => reply(i18n.t("common.start")));

const enqueueDownload = async (ctx: BotContext, url: string): Promise<void> => {
  const position = downloadQ.size + downloadQ.pending + 1;
  const message = await ctx.reply(ctx.i18n.t("download_start"), {
    reply_to_message_id: ctx.message!.message_id,
  });

  createDownloadJob({
    chatId: ctx.chat!.id,
    messageId: ctx.message!.message_id,
    messageToEdit: message.message_id,
    url,
    cookies: ctx.session.cookie,
  });

  if (position > 1) {
    ctx.telegram
      .editMessageText(
        message.chat.id,
        message.message_id,
        "",
        ctx.i18n.t("queue.in_queue", { position, length: position })
      )
      .catch(() => {});
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
  if (
    !ctx.message!.document!.mime_type ||
    !ctx.message!.document!.mime_type.startsWith("video")
  ) {
    return ctx.reply(ctx.i18n.t("download_document.error.not_a_video"), {
      reply_to_message_id: ctx.message!.message_id,
      parse_mode: "HTML",
    });
  }

  try {
        const file = await ctx.telegram.getFile(ctx.message!.video!.file_id);
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
  try {
    const file = await ctx.telegram.getFile(ctx.message!.video!.file_id);
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
  ctx.reply(ctx.i18n.t("cookies", { cookie: match[1] }));
});
