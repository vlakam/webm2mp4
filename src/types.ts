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
  i18n: any;
  session: BotSession;
}

export type BaseJob = {
  chatId: number;
  messageId: number;
  messageToEdit: number;
}

export type DownloadJob = BaseJob & {
  url: string;
  cookies?: string;
}

export type ConvertJob = BaseJob & {
  filePath: string;
  dir: string;
}