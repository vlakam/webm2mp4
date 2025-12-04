import i18next, { TOptions } from 'i18next';
import FsBackend from 'i18next-fs-backend';
import path from 'path';
import { BotContext } from '@/types';

const localesPath = path.resolve(__dirname, '..', 'locales');
const i18nextInstance = i18next.createInstance();

const initPromise = i18nextInstance
  .use(FsBackend)
  .init({
    preload: ['en', 'ru'],
    fallbackLng: 'en',
    lng: 'en',
    backend: {
      loadPath: path.join(localesPath, '{{lng}}.json')
    },
    interpolation: {
      escapeValue: false
    },
    initImmediate: false
  });

const getLocale = (ctx: BotContext): string =>
  ctx.from?.language_code?.split('-')[0] ?? 'en';

const translateWithLocale = (locale: string, key: string, options?: TOptions) =>
  i18nextInstance.t(key, { lng: locale, ...options });

export const i18n = {
  t: (lng: string, key: string, options?: TOptions): string =>
    translateWithLocale(lng, key, options),
  getLocale,
  ready: initPromise
};
