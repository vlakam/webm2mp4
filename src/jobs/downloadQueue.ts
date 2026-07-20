import { promises as fs, createWriteStream, createReadStream } from "fs";
import PQueue from "p-queue";
import path from "path";
import { pipeline } from "stream/promises";
import { DownloadError } from "../error";
import { ConvertJob, DownloadJob } from "../types";
import os from "os";
import { createHash } from "crypto";
import { videoCache } from "@/cache/videoCache";
import { createCleanJob } from "./cleanQueue";
import { createCacheRemoveJob } from "./cacheQueue";
import { createCachedSendJob } from "./sendQueue";
import { createConvertJob } from "./convert/convertQueue";
import { editJobMessageText } from "@/utils";

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
    await editJobMessageText(data, text);
  } catch (e) {
    //ignore
  }
};

const downloadJob = async (data: DownloadJob) => {
  let dir: string | undefined;
  try {
    const res = await downloadFile(data);
    dir = res.dir;
    const jobDir = res.dir;
    const filePath = res.filePath;
    const convertJobData: ConvertJob = { ...data, dir: jobDir, filePath };
    const hash = await fileHash(filePath);
    const cachedVideo = data.skipCache ? null : await videoCache.find(hash);
    if (cachedVideo) {
      createCachedSendJob({
        ...data,
        cache: cachedVideo,
        dir: jobDir,
        hash,
        onCacheSendFailure: () => {
          createCacheRemoveJob(hash);
          createCleanJob(jobDir);
          createDownloadJob({
            ...data,
            skipCache: true,
          });
        },
      });
      return;
    }

    createConvertJob({ ...convertJobData, hash });
  } catch (err) {
    if (dir) {
      createCleanJob(dir);
    }
    throw err;
  }
};
