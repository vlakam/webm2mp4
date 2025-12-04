import PQueue from "p-queue";
import { env } from "@/env";
import { ConvertJob } from "@/types";
import FfmpegConverter from "./ffmpeg-converter";
import { createSendJob } from "../sendQueue";
import { createCleanJob } from "../cleanQueue";
import { i18n } from "@/middlewares";
import { editJobMessageText } from "@/utils";

const convertQ = new PQueue({ concurrency: env.THREADS });

const updateStatusMessage = async (data: ConvertJob, text: string) =>
  editJobMessageText(data, text, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

export const createConvertJob = (data: ConvertJob) => {
  const position = convertQ.size + convertQ.pending + 1;
  const locale = data.locale ?? "en";

  if (position > env.THREADS) {
    updateStatusMessage(
      data,
      i18n.t(locale, "queue.in_queue", { position, length: position })
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

      createSendJob({
        chatId: data.chatId,
        messageId: data.messageId,
        dir: data.dir,
        resultPath: result.outputPath,
        thumbPath: result.thumbPath,
        durationSeconds: result.durationSeconds,
        locale: data.locale,
        messageToEdit: data.messageToEdit,
      });
    } catch (err) {
      console.error("Convert job failed", err);
      createCleanJob(data.dir);
    }
  });
};
