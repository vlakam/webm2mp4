import PQueue from "p-queue";
import { BaseJob } from "../types";
import { CachedVideo } from "@/cache/videoCache";
import { bot } from "../botInstance";
import { createCleanJob } from "./cleanQueue";
import { createCacheSaveJob } from "./cacheQueue";
import { editJobMessageText } from "@/utils";
import { i18n } from "@/middlewares";
import { processError } from "@/error";

const VIDEO_PREFIX = "#video#!";
const DOC_PREFIX = "#document#!";
const sendQ = new PQueue({ concurrency: 5 });

const deleteStatusMessage = async (
  chatId: number,
  messageToEdit: number
): Promise<void> => {
  try {
    await bot.telegram.deleteMessage(chatId, messageToEdit);
  } catch (err) {
    console.error("Failed to delete status message", err);
  }
};

export type SendCachedJob = BaseJob & {
  cache: CachedVideo;
  dir: string;
  hash: string;
  url: string;
  cookies?: string;
  onCacheSendFailure: () => void;
};

export type SendJob = BaseJob & {
  dir: string;
  resultPath: string;
  thumbPath?: string;
  durationSeconds?: number;
  hash?: string;
};

export const createSendJob = (data: SendJob) => {
  const locale = data.locale ?? "en";
  const {
    chatId,
    messageId,
    messageToEdit,
    resultPath,
    thumbPath,
    dir,
    durationSeconds,
    hash,
  } = data;
  sendQ
    .add(async () => {
      try {
        await editJobMessageText(
          data,
          i18n.t(locale, "convert.sending")
        );
        await bot.telegram.sendChatAction(chatId, "upload_video");

        const message = await bot.telegram.sendVideo(
          chatId,
          { source: resultPath },
          {
            thumb: thumbPath ? { source: thumbPath } : undefined,
            reply_to_message_id: messageId,
            supports_streaming: true,
            duration: durationSeconds
              ? Math.round(durationSeconds)
              : undefined,
          }
        );
        const videoFileId = message.video?.file_id;
        const thumbFileId = message.video?.thumb?.file_id;
        if (hash && videoFileId) {
          createCacheSaveJob({
            hash,
            videoFileId: `${VIDEO_PREFIX}${videoFileId}`,
            thumbFileId,
          });
        }

        await deleteStatusMessage(chatId, messageToEdit);
      } finally {
        createCleanJob(dir);
      }
    })
    .catch((err) => {
      console.error("Send job failed", err);
      processError(err, data).catch((processErr) => {
        console.error("Failed to report send error", processErr);
      });
    });
};

export const createCachedSendJob = (data: SendCachedJob) => {
  const locale = data.locale ?? "en";
  const { chatId, messageId, messageToEdit, cache } = data;
  sendQ
    .add(async () => {
      await editJobMessageText(
        data,
        i18n.t(locale, "convert.sending")
      );
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
      } else {
        throw new Error(`Unsupported cached video id prefix: ${videoFileId}`);
      }

      await deleteStatusMessage(chatId, messageToEdit);
    })
    .catch((err) => {
      console.error("Cached send job failed", err);
      data.onCacheSendFailure();
    });
};
