import { SizeError } from "./error";
import { i18n } from "./middlewares";
import { BaseJob, BotContext } from "./types";
import { bot } from "./botInstance";
import { createDownloadJob, downloadQ } from "./jobs/downloadQueue";
import { isAbsolute } from "path";
import { env } from "./env";
import { editJobMessageText } from "@/utils";

import { settings } from "./settings";
import { extractUrls } from "./messagePolicy";

bot.command("remux", async (ctx) => {
  if (!ctx.from || !env.ADMIN_USER_IDS.has(ctx.from.id)) {
    await ctx.reply("This command is restricted to bot admins.");
    return;
  }
  const argument = ctx.message?.text?.trim().split(/\s+/).slice(1).join(" ").toLowerCase();
  if (argument && argument !== "on" && argument !== "off") {
    await ctx.reply("Usage: /remux [on|off]");
    return;
  }
  await settings.ready;
  if (argument) await settings.setRemuxEnabled(argument === "on");
  await ctx.reply(`Remuxing is ${settings.remuxEnabled ? "on" : "off"} globally. Changes apply to new jobs.`);
});
bot.command("multiurl", async (ctx) => {
  if (!ctx.from || !env.ADMIN_USER_IDS.has(ctx.from.id)) {
    await ctx.reply("This command is restricted to bot admins.");
    return;
  }
  const args = ctx.message?.text?.trim().split(/\s+/).slice(1) || [];
  const [action, rawId] = args;
  await settings.ready;
  if (!args.length || (action === "list" && args.length === 1)) {
    const ids = settings.multiUrlUserIds;
    if (!ids.length) {
      await ctx.reply("The multi-URL whitelist is empty.");
      return;
    }
    for (let offset = 0; offset < ids.length; offset += 100) {
      await ctx.reply(`Multi-URL whitelist:\n${ids.slice(offset, offset + 100).join("\n")}`);
    }
    return;
  }
  const userId = Number(rawId);
  if (args.length !== 2 || (action !== "add" && action !== "remove") ||
      !/^\d+$/.test(rawId) || !Number.isSafeInteger(userId) || userId <= 0) {
    await ctx.reply("Usage: /multiurl list | /multiurl add <user_id> | /multiurl remove <user_id>");
    return;
  }
  await settings.setMultiUrlUser(userId, action === "add");
  await ctx.reply(`User ${userId} ${action === "add" ? "added to" : "removed from"} the multi-URL whitelist.`);
});

bot.start((ctx) =>
  ctx
    .reply(i18n.t(i18n.getLocale(ctx), "common.start"))
    .catch((e) => console.error(`/start reply failed: ${e}`))
);

const enqueueDownload = async (ctx: BotContext, url: string): Promise<void> => {
  await settings.ready;
  const remuxEnabled = settings.remuxEnabled;
  const cookies = ctx.from ? await settings.getUserCookie(ctx.from.id) : undefined;
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
    cookies,
    remuxEnabled,
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

const setCookie = async (ctx: BotContext): Promise<void> => {
  if (!ctx.from) return;
  const cookie = ctx.message?.text?.replace(/^\/?setcookie(?:@\w+)?(?:[ \t]+|$)/, "").trim();
  if (!cookie || /[\r\n]/.test(cookie)) {
    await ctx.reply("Usage: /setcookie <cookie header>");
    return;
  }
  await settings.setUserCookie(ctx.from.id, cookie);
  await ctx.reply(i18n.t(i18n.getLocale(ctx), "cookies"));
};

// Handle cookies before URL messages, including cookie values containing URLs.
bot.command("setcookie", setCookie);
bot.hears(/^setcookie(?:[ \t]+.*)?$/, setCookie);

bot.on("text", async (ctx: BotContext, next) => {
  await settings.ready;
  const urls = extractUrls(
    ctx.message?.text || "",
    ctx.message?.entities || [],
    Boolean(ctx.from && settings.canUseMultipleUrls(ctx.from.id))
  );
  if (!urls.length) return next();
  for (const url of urls) await enqueueDownload(ctx, url);
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


bot.catch((err: Error) => {
  console.error(`Bot error`, err);
});