import PQueue from "p-queue";
import { BaseJob } from "../types";
import { CachedVideo } from "../db/models/cachedVideo";
import { bot } from "../botInstance";
import { createCleanJob } from "./cleanQueue";

const VIDEO_PREFIX = "#video#!";
const DOC_PREFIX = "#document#!";
const sendQ = new PQueue({ concurrency: 5 });

export type SendCachedJob = BaseJob & {
  cache: CachedVideo;
};

export type SendJob = BaseJob & {
  dir: string;
  resultPath: string;
  thumbPath?: string;
};

export const createSendJob = (data: SendJob) => {
  const { chatId, messageId, messageToEdit, resultPath, thumbPath, dir } = data;
  sendQ
    .add(async () => {
      try {
        bot.telegram.editMessageText(chatId, messageToEdit, "", "sending");
        await bot.telegram.sendChatAction(chatId, "upload_video");

        await bot.telegram.sendVideo(
          chatId,
          { source: resultPath },
          {
            thumb: thumbPath ? { source: thumbPath } : undefined,
            reply_to_message_id: messageId,
          }
        );

        await bot.telegram.deleteMessage(chatId, messageToEdit);
      } finally {
        createCleanJob(dir);
      }
    })
    .catch((err) => {
      console.error("Send job failed", err);
      createCleanJob(dir);
    });
};

export const createCachedSendJob = (data: SendCachedJob) => {
  const { chatId, messageId, messageToEdit, cache } = data;
  sendQ.add(async () => {
    bot.telegram.editMessageText(chatId, messageToEdit, "", "sending");
    await bot.telegram.sendChatAction(chatId, "upload_video");

    const { videoFileId, thumbFileId } = cache;

    if (videoFileId.startsWith(VIDEO_PREFIX)) {
      const fileId = videoFileId.substring(VIDEO_PREFIX.length);
      await bot.telegram.sendVideo(chatId, fileId, {
        thumb: thumbFileId || undefined,
        reply_to_message_id: messageId,
      });
    } else if (videoFileId.startsWith(DOC_PREFIX)) {
      const fileId = videoFileId.substring(DOC_PREFIX.length);
      await bot.telegram.sendDocument(chatId, fileId, {
        thumb: thumbFileId || undefined,
        reply_to_message_id: messageId,
      });
    }

    await bot.telegram.deleteMessage(chatId, messageToEdit);
  });
};
