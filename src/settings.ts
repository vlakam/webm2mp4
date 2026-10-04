import { promises as fs } from "fs";
import path from "path";
import Datastore from "@seald-io/nedb";
import { env } from "./env";

interface BotSettings {
  _id: string;
  remuxEnabled: boolean;
  multiUrlUserIds: number[];
}

interface UserSettings {
  _id: string;
  cookie: string;
}

const SETTINGS_ID = "bot-settings";
const settingsDirectory = path.dirname(env.CACHE_DB_PATH);

const db = new Datastore<BotSettings | UserSettings>({
  filename: path.join(settingsDirectory, "settings.db"),
});

let currentSettings: BotSettings;
let pendingWrites = Promise.resolve();

function isValidUserId(userId: number): boolean {
  return Number.isSafeInteger(userId) && userId > 0;
}

function validateSettings(saved: BotSettings): void {
  const validRemuxSetting = typeof saved.remuxEnabled === "boolean";
  const validWhitelist = Array.isArray(saved.multiUrlUserIds)
    && saved.multiUrlUserIds.every(isValidUserId);

  if (!validRemuxSetting || !validWhitelist) {
    throw new Error("Invalid persisted bot settings");
  }
}

async function loadSettings(): Promise<void> {
  await fs.mkdir(settingsDirectory, { recursive: true });
  await db.loadDatabaseAsync();

  const saved = await db.findOneAsync<BotSettings>({ _id: SETTINGS_ID });

  if (saved) {
    validateSettings(saved);
    currentSettings = saved;
    return;
  }

  // Seed a new database. Later starts use the saved settings.
  const initialSettings: BotSettings = {
    _id: SETTINGS_ID,
    remuxEnabled: true,
    multiUrlUserIds: [...env.MULTI_URL_USER_IDS],
  };

  await db.insertAsync(initialSettings);
  currentSettings = initialSettings;
}

const ready = loadSettings();

function updateSettings(
  change: (current: BotSettings) => BotSettings
): Promise<void> {
  // Queue read-modify-write operations so concurrent admin commands retain
  // each other's changes. Publish the new state only after it is persisted.
  const write = pendingWrites.then(async () => {
    await ready;

    const nextSettings = change(currentSettings);
    await db.updateAsync({ _id: SETTINGS_ID }, nextSettings, {});
    currentSettings = nextSettings;
  });

  // Report failures to the caller, but allow later writes to proceed.
  pendingWrites = write.catch(() => {});
  return write;
}

export const settings = {
  ready,

  get remuxEnabled(): boolean {
    return currentSettings.remuxEnabled;
  },

  get multiUrlUserIds(): number[] {
    return [...currentSettings.multiUrlUserIds].sort((a, b) => a - b);
  },

  canUseMultipleUrls(userId: number): boolean {
    return currentSettings.multiUrlUserIds.includes(userId);
  },

  setRemuxEnabled(enabled: boolean): Promise<void> {
    return updateSettings(current => ({
      ...current,
      remuxEnabled: enabled,
    }));
  },

  setMultiUrlUser(userId: number, allowed: boolean): Promise<void> {
    if (!isValidUserId(userId)) {
      return Promise.reject(new Error("Invalid Telegram user ID"));
    }

    return updateSettings(current => {
      const userIds = new Set(current.multiUrlUserIds);

      if (allowed) {
        userIds.add(userId);
      } else {
        userIds.delete(userId);
      }

      return {
        ...current,
        multiUrlUserIds: [...userIds],
      };
    });
  },

  async getUserCookie(userId: number): Promise<string | undefined> {
    await ready;

    const user = await db.findOneAsync<UserSettings>({
      _id: `user:${userId}`,
    });

    return user?.cookie;
  },

  async setUserCookie(userId: number, cookie: string): Promise<void> {
    if (!isValidUserId(userId)) {
      throw new Error("Invalid Telegram user ID");
    }

    if (!cookie || /[\r\n]/.test(cookie)) {
      throw new Error("Invalid cookie header");
    }

    await ready;
    await db.updateAsync<UserSettings, { upsert: true }>(
      { _id: `user:${userId}` },
      { $set: { cookie } },
      { upsert: true }
    );
  },
};
