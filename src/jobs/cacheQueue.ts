import PQueue from "p-queue";
import { CachedVideo, videoCache } from "@/cache/videoCache";

const cacheQ = new PQueue({ concurrency: 1 });

export const createCacheSaveJob = (data: CachedVideo): void => {
  cacheQ
    .add(async () => {
      await videoCache.save(data);
    })
    .catch((err) => {
      console.error("Cache save job failed", err);
    });
};

export const createCacheRemoveJob = (hash: string): void => {
  cacheQ
    .add(async () => {
      await videoCache.remove(hash);
    })
    .catch((err) => {
      console.error("Cache remove job failed", err);
    });
};
