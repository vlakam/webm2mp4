type MessageEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
};

export function parseUserIds(value = ""): Set<number> {
  const entries = value
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean);

  const userIds = new Set<number>();

  for (const entry of entries) {
    const userId = Number(entry);
    const isValid = /^\d+$/.test(entry)
      && Number.isSafeInteger(userId)
      && userId > 0;

    if (!isValid) {
      throw new Error(
        "User ID lists must contain comma-separated positive Telegram user IDs"
      );
    }

    userIds.add(userId);
  }

  return userIds;
}

export function extractUrls(
  text: string,
  entities: ReadonlyArray<MessageEntity>,
  allowMultiple: boolean
): string[] {
  const urls = new Set<string>();

  for (const entity of entities) {
    let url: string;

    if (entity.type === "text_link") {
      url = entity.url || "";
    } else if (entity.type === "url") {
      // Telegram offsets and JavaScript string indices both use UTF-16 units.
      url = text.substring(entity.offset, entity.offset + entity.length);
    } else {
      continue;
    }

    if (!/^https?:\/\//i.test(url)) continue;

    urls.add(url);
    if (!allowMultiple) break;
  }

  return [...urls];
}

export function conversionCacheKey(hash: string, remuxEnabled: boolean): string {
  // A forced H.264 job must not reuse an earlier remuxed result.
  const mode = remuxEnabled ? "remux" : "h264";
  return `v3:${mode}:${hash}`;
}
