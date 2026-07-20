import PQueue from "p-queue";
import fs from "fs";
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

const logSend = (
  stage: string,
  job: BaseJob,
  extra: Record<string, unknown> = {}
): void => {
  console.info("Send job", {
    stage,
    chatId: job.chatId,
    messageId: job.messageId,
    messageToEdit: job.messageToEdit,
    ...extra,
  });
};

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
  const queuedAt = Date.now();
  logSend("queued", data, {
    pending: sendQ.pending,
    size: sendQ.size,
    resultPath,
    thumbPath,
    hash,
  });

  sendQ
    .add(async () => {
      const startedAt = Date.now();
      try {
        const stat = await fs.promises.stat(resultPath).catch(() => null);
        logSend("started", data, {
          waitMs: startedAt - queuedAt,
          resultSizeBytes: stat?.size,
          durationSeconds,
        });

        logSend("status_edit_start", data);
        await editJobMessageText(
          data,
          i18n.t(locale, "convert.sending")
        );
        logSend("status_edit_done", data);

        logSend("chat_action_start", data);
        await bot.telegram.sendChatAction(chatId, "upload_video");
        logSend("chat_action_done", data);

        logSend("upload_start", data, {
          resultPath,
          resultSizeBytes: stat?.size,
          thumbPath,
        });
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
        logSend("upload_done", data, {
          elapsedMs: Date.now() - startedAt,
          telegramMessageId: message.message_id,
          hasVideoFileId: Boolean(message.video?.file_id),
          hasThumbFileId: Boolean(message.video?.thumb?.file_id),
        });

        const videoFileId = message.video?.file_id;
        const thumbFileId = message.video?.thumb?.file_id;
        if (hash && videoFileId) {
          logSend("cache_save_queued", data, { hash });
          createCacheSaveJob({
            hash,
            videoFileId: `${VIDEO_PREFIX}${videoFileId}`,
            thumbFileId,
          });
        }

        logSend("delete_status_start", data);
        await deleteStatusMessage(chatId, messageToEdit);
        logSend("delete_status_done", data);
      } finally {
        logSend("cleanup_queued", data, { dir });
        createCleanJob(dir);
      }
    })
    .catch((err) => {
      console.error("Send job failed", {
        chatId,
        messageId,
        messageToEdit,
        resultPath,
        elapsedSinceQueueMs: Date.now() - queuedAt,
        err,
      });
      processError(err, data).catch((processErr) => {
        console.error("Failed to report send error", processErr);
      });
    });
};

export const createCachedSendJob = (data: SendCachedJob) => {
  const locale = data.locale ?? "en";
  const { chatId, messageId, messageToEdit, cache } = data;
  const queuedAt = Date.now();
  logSend("cached_queued", data, {
    pending: sendQ.pending,
    size: sendQ.size,
    hash: data.hash,
  });

  sendQ
    .add(async () => {
      const startedAt = Date.now();
      logSend("cached_started", data, {
        waitMs: startedAt - queuedAt,
        hash: data.hash,
      });

      logSend("cached_status_edit_start", data);
      await editJobMessageText(
        data,
        i18n.t(locale, "convert.sending")
      );
      logSend("cached_status_edit_done", data);

      logSend("cached_chat_action_start", data);
      await bot.telegram.sendChatAction(chatId, "upload_video");
      logSend("cached_chat_action_done", data);

      const { videoFileId, thumbFileId } = cache;

      if (videoFileId.startsWith(VIDEO_PREFIX)) {
        const fileId = videoFileId.substring(VIDEO_PREFIX.length);
        logSend("cached_upload_video_start", data, { hash: data.hash });
        await bot.telegram.sendVideo(chatId, fileId, {
          thumb: thumbFileId || undefined,
          reply_to_message_id: messageId,
        });
        logSend("cached_upload_video_done", data, {
          elapsedMs: Date.now() - startedAt,
          hash: data.hash,
        });
      } else if (videoFileId.startsWith(DOC_PREFIX)) {
        const fileId = videoFileId.substring(DOC_PREFIX.length);
        logSend("cached_upload_document_start", data, { hash: data.hash });
        await bot.telegram.sendDocument(chatId, fileId, {
          thumb: thumbFileId || undefined,
          reply_to_message_id: messageId,
        });
        logSend("cached_upload_document_done", data, {
          elapsedMs: Date.now() - startedAt,
          hash: data.hash,
        });
      } else {
        throw new Error(`Unsupported cached video id prefix: ${videoFileId}`);
      }

      logSend("cached_delete_status_start", data);
      await deleteStatusMessage(chatId, messageToEdit);
      logSend("cached_delete_status_done", data);
    })
    .catch((err) => {
      console.error("Cached send job failed", {
        chatId,
        messageId,
        messageToEdit,
        hash: data.hash,
        elapsedSinceQueueMs: Date.now() - queuedAt,
        err,
      });
      data.onCacheSendFailure();
    });
};
