import PQueue from "p-queue";
import { env } from "@/env";
import { ConvertJob } from "@/types";
import FfmpegConverter from "./ffmpeg-converter";
import { createSendJob } from "../sendQueue";
import { createCleanJob } from "../cleanQueue";
import { i18n } from "@/middlewares";
import { editJobMessageText } from "@/utils";
import { processError } from "@/error";

const convertQ = new PQueue({ concurrency: env.THREADS });

const logConvert = (
  stage: string,
  job: ConvertJob,
  extra: Record<string, unknown> = {}
): void => {
  console.info("Convert job", {
    stage,
    chatId: job.chatId,
    messageId: job.messageId,
    messageToEdit: job.messageToEdit,
    filePath: job.filePath,
    dir: job.dir,
    hash: job.hash,
    ...extra,
  });
};

const updateStatusMessage = async (data: ConvertJob, text: string) =>
  editJobMessageText(data, text, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

export const createConvertJob = (data: ConvertJob) => {
  const position = convertQ.size + convertQ.pending + 1;
  const locale = data.locale ?? "en";
  const queuedAt = Date.now();

  logConvert("queued", data, {
    pending: convertQ.pending,
    size: convertQ.size,
    position,
  });

  if (position > env.THREADS) {
    void updateStatusMessage(
      data,
      i18n.t(locale, "queue.in_queue", { position, length: position })
    ).catch((err) => {
      console.error("Failed to update convert queue position", err);
    });
  }

  convertQ
    .add(async () => {
      const startedAt = Date.now();
      try {
        logConvert("started", data, {
          waitMs: startedAt - queuedAt,
        });

        let lastNotification = 0;
        const converter = new FfmpegConverter(data);
        converter.setHooks({
          onProgress: async (_progress, bar) => {
            const now = Math.floor(Date.now() / 1000);
            if (now - lastNotification < 10) return;
            lastNotification = now;
            await updateStatusMessage(
              data,
              i18n.t(locale, "convert.processing", {
                progressBar: bar,
              })
            );
          },
          onThumbnailStart: async () => {
            await updateStatusMessage(
              data,
              i18n.t(locale, "convert.generating_thumbnail")
            );
          },
        });

        const result = await converter.run();
        logConvert("done", data, {
          elapsedMs: Date.now() - startedAt,
          outputPath: result.outputPath,
          thumbPath: result.thumbPath,
          sizeMb: result.sizeMb,
          durationSeconds: result.durationSeconds,
        });

        createSendJob({
          chatId: data.chatId,
          messageId: data.messageId,
          dir: data.dir,
          resultPath: result.outputPath,
          thumbPath: result.thumbPath,
          durationSeconds: result.durationSeconds,
          hash: data.hash,
          locale: data.locale,
          messageToEdit: data.messageToEdit,
        });
      } catch (err) {
        console.error("Convert job failed", {
          chatId: data.chatId,
          messageId: data.messageId,
          messageToEdit: data.messageToEdit,
          filePath: data.filePath,
          dir: data.dir,
          hash: data.hash,
          elapsedMs: Date.now() - startedAt,
          err,
        });
        await processError(err, data).catch((processErr) => {
          console.error("Failed to report convert error", processErr);
        });
        createCleanJob(data.dir);
      }
    })
    .catch((err) => {
      console.error("Convert queue job failed", err);
      createCleanJob(data.dir);
    });
};
