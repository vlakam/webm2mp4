import { i18n } from './middlewares';
import { BaseJob, BotContext } from './types';
import { editJobMessageText } from "@/utils";

class NotAVideoError extends Error {
  i18n: string;
  constructor(message?: string) {
    super(message);
    this.message = message || '';
    this.name = 'NotAVideoError';
    this.i18n = 'download_url.error.not_a_video';
  }
}

class TimeoutError extends Error {
  i18n: string;
  constructor(message?: string) {
    super(message);
    this.message = message || '';
    this.name = 'TimeoutError';
    this.i18n = 'timeout';
  }
}

class DownloadError extends Error {
  i18n: string;
  constructor(message?: string) {
    super(message);
    this.message = message || '';
    this.name = 'DownloadError';
    this.i18n = 'download_url.error.download';
  }
}

class SizeError extends Error {
  i18n: string;
  constructor(message?: string) {
    super(message);
    this.message = message || '';
    this.name = 'SizeError';
    this.i18n = 'download_url.error.size';
  }
}

class ConvertError extends Error {
  i18n: string;
  constructor(message?: string) {
    super(message);
    this.message = message || '';
    this.name = 'ConvertError';
    this.i18n = 'convert.error';
  }
}

class BigOutputError extends Error {
  i18n: string;
  constructor(message?: string) {
    super(message);
    this.message = message || '';
    this.name = 'BigOutputError';
    this.i18n = 'convert.big_output';
  }
}

const processError = async (err: Error, ctx: BotContext): Promise<void> => {
  console.log(`Error ${err}`);
  let replyText = i18n.translate(ctx, 'error');
  const msg = ctx.messageToEdit;
  const url = ctx.url;
  if (!ctx.chat) return;

  switch (err.constructor) {
    case TimeoutError:
    case NotAVideoError:
    case DownloadError:
    case ConvertError:
    case BigOutputError:
    case SizeError:
      replyText = i18n.translate(ctx, (err as any).i18n, { url });
      break;
    default:
      replyText = i18n.translate(ctx, 'error');
  }

  if (msg) {
    const job: BaseJob = {
      chatId: msg.chat.id,
      messageId: msg.message_id,
      messageToEdit: msg.message_id,
      locale: ctx.from?.language_code?.split('-')[0] ?? 'en',
    };
    await editJobMessageText(job, replyText, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } else {
    await ctx.telegram.sendMessage(
      ctx.chat.id,
      replyText,
      { parse_mode: 'HTML', disable_web_page_preview: true }
    );
  }
};

export {
  processError,
  NotAVideoError,
  BigOutputError,
  ConvertError,
  SizeError,
  DownloadError,
  TimeoutError
};
