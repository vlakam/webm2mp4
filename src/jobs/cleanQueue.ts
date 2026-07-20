import fs from "fs";
import PQueue from "p-queue";

const cleanQueue = new PQueue({ concurrency: 5 });

export const createCleanJob = (dir: string) => {
  cleanQueue
    .add(async () => {
      await cleanupFolder(dir);
    })
    .catch((err) => {
      console.error("Clean job failed", err);
    });
};

const cleanupFolder = async (dir?: string): Promise<void> => {
  if (!dir) return;
  await fs.promises.rm(dir, { recursive: true, force: true });
};
