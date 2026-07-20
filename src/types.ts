import { Context } from 'telegraf';
import { Message } from 'telegraf/typings/telegram-types';

export interface BotSession {
  cookie?: string;
}

export interface BotContext extends Context {
  url?: string;
  fileName?: string;
  resultFileName?: string;
  thumbName?: string;
  messageToEdit?: Message;
  extraVideo?: any;
  notification?: number;
  session: BotSession;
}

export type BaseJob = {
  chatId: number;
  messageId: number;
  messageToEdit: number;
  locale: string;
}

export type DownloadJob = BaseJob & {
  url: string;
  cookies?: string;
  skipCache?: boolean;
}

export type ConvertJob = BaseJob & {
  filePath: string;
  dir: string;
  hash?: string;
}
