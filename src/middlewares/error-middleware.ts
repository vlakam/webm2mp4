import { Middleware } from 'telegraf';
import { processError } from '../error';
import { BotContext } from '../types';

export const errorMiddleware: Middleware<BotContext> = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    await processError(err as Error, ctx);
  }
};
