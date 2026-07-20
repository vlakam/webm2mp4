import path from "path";
import fs from "fs";
import Datastore from "@seald-io/nedb";
import { env } from "@/env";

export interface CachedVideo {
  hash: string;
  videoFileId: string;
  thumbFileId?: string | null;
}

const db = new Datastore<CachedVideo>({
  filename: env.CACHE_DB_PATH,
});

const ready = (async (): Promise<void> => {
  await fs.promises.mkdir(path.dirname(env.CACHE_DB_PATH), {
    recursive: true,
  });
  await db.loadDatabaseAsync();
  await db.ensureIndexAsync({ fieldName: "hash", unique: true });
})();

const find = async (hash: string): Promise<CachedVideo | null> => {
  await ready;
  const result = await db.findOneAsync<CachedVideo>({ hash });
  return result ?? null;
};

const save = async (video: CachedVideo): Promise<void> => {
  await ready;
  await db.updateAsync<CachedVideo, { upsert: true }>(
    { hash: video.hash },
    { $set: video },
    { upsert: true }
  );
};

const remove = async (hash: string): Promise<void> => {
  await ready;
  await db.removeAsync({ hash }, {});
};

export const videoCache = {
  ready,
  find,
  save,
  remove,
};
