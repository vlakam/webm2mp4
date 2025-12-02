import PQueue from "p-queue";
import { env } from "@/env";
import { ConvertJob } from "@/types";
import FfmpegConverter from "./ffmpeg-converter";
import { createSendJob } from "../sendQueue";
import { createCleanJob } from "../cleanQueue";
import { bot } from "@/botInstance";
import { i18n } from "@/middlewares";

const convertQ = new PQueue({ concurrency: env.THREADS });

const updateStatusMessage = async (data: ConvertJob, text: string) => {
  try {
    await bot.telegram.editMessageText(
      data.chatId,
      data.messageToEdit,
      "",
      text,
      { parse_mode: "HTML", disable_web_page_preview: true }
    );
  } catch (_) {
    // ignore
  }
};

export const createConvertJob = (data: ConvertJob) => {
  const position = convertQ.size + convertQ.pending + 1;

  if (position > env.THREADS) {
    updateStatusMessage(
      data,
      i18n.t("en", "queue.in_queue", { position, length: position })
    );
  }

  convertQ.add(async () => {
    try {
      let lastNotification = 0;
      const converter = new FfmpegConverter(data);
      converter.setHooks({
        onProgress: async (_progress, bar) => {
          const now = Math.floor(Date.now() / 1000);
          if (now - lastNotification < 10) return;
          lastNotification = now;
          await updateStatusMessage(
            data,
            i18n.t("en", "convert.processing", {
              url: "",
              progressBar: bar,
            })
          );
        },
        onThumbnailStart: async () => {
          await updateStatusMessage(
            data,
            "🖼 Generating thumbnail"
          );
        },
      });

      const result = await converter.run();

      createSendJob({
        chatId: data.chatId,
        messageId: data.messageId,
        dir: data.dir,
        resultPath: result.outputPath,
        thumbPath: result.thumbPath,
        messageToEdit: data.messageToEdit,
      });
    } catch (err) {
      console.error("Convert job failed", err);
      createCleanJob(data.dir);
    }
  });
};
