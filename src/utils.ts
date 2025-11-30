import fs from "fs";
import crypto from "crypto";
import path from "path";
import os from "os";
export const MODE = process.env.MODE === "develop" ? "develop" : "production";

export class Deferred<T = void> {
  resolve!: (value: T | PromiseLike<T>) => void;
  reject!: (reason?: unknown) => void;
  promise: Promise<T>;

  constructor() {
    this.promise = new Promise((rs, rj) => {
      this.resolve = rs;
      this.reject = rj;
    });
  }

  getPromise(): Promise<T> {
    return this.promise;
  }
}


export const cleanStaleTmp = async (
  prefix = "webm2mp4-",
  maxAgeMs = 24 * 60 * 60 * 1000
): Promise<void> => {
  const tmp = os.tmpdir();
  const entries = await fs.promises.readdir(tmp, { withFileTypes: true });
  const now = Date.now();
  for (const e of entries) {
    if (e.isDirectory() && e.name.startsWith(prefix)) {
      const dir = path.join(tmp, e.name);
      const stat = await fs.promises.stat(dir);
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.promises.rm(dir, { recursive: true, force: true });
      }
    }
  }
};
