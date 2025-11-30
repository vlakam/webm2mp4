import { promises as fs, createWriteStream, createReadStream } from "fs";
import PQueue from "p-queue";
import path from "path";
import { pipeline } from "stream/promises";
import { DownloadError } from "../error";
import { ConvertJob, DownloadJob } from "../types";
import os from "os";
import { createHash } from "crypto";
import { CachedVideo } from "../db";
import { createCleanJob } from "./cleanQueue";
import { createCachedSendJob } from "./sendQueue";
import { createConvertJob } from "./convert/convertQueue";
import { bot } from "../botInstance";

export const downloadQ = new PQueue({ concurrency: 2 });

const downloadFile = async (
  data: DownloadJob
): Promise<{ dir: string; filePath: string }> => {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), `webm2mp4-${data.chatId}`)
  );
  const filePath = path.join(dir, `${data.messageId}.webm`);

  const res = await fetch(data.url, {
    headers: { cookie: data.cookies ?? "" },
  });
  if (res.status === 404) {
    throw new DownloadError("Not found");
  }
  if (!res.ok || !res.body) throw new DownloadError("Failed request");

  await pipeline(res.body, createWriteStream(filePath));
  return { dir, filePath };
};

const fileHash = async (
  filename: string,
  algorithm = "sha256"
): Promise<string> => {
  const hash = createHash(algorithm);
  await pipeline(createReadStream(filename), hash);
  return hash.digest("hex");
};

export const createDownloadJob = (data: DownloadJob) => {
  downloadQ
    .add(() => downloadJob(data))
    .catch((err) => handleDownloadError(err, data));
};

const handleDownloadError = async (err: any, data: DownloadJob) => {
  console.error("Download job failed", err.message);
  try {
    const text =
      err instanceof DownloadError && err.message === "Not found"
        ? "File not found (404)"
        : "Failed to download file";
    await bot.telegram.editMessageText(
      data.chatId,
      data.messageToEdit,
      "",
      text
    );
  } catch (e) {
    //ignore
  }
};

const downloadJob = async (data: DownloadJob) => {
  let dir: string | undefined;
  try {
    const res = await downloadFile(data);
    dir = res.dir;
    const filePath = res.filePath;
    const convertJobData: ConvertJob = { ...data, dir, filePath };
    const hash = await fileHash(filePath);
    const cachedVideo = await CachedVideo.findOne({ hash });
    if (cachedVideo) {
      createCleanJob(dir);
      createCachedSendJob({
        ...data,
        cache: cachedVideo,
      });
      return;
    }

    createConvertJob(convertJobData);
  } catch (err) {
    if (dir) {
      createCleanJob(dir);
    }
    throw err;
  }
};
