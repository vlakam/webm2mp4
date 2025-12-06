import i18next, { TOptions } from 'i18next';
import { BotContext } from '@/types';

import enLocale from "@/locales/en.json";
import ruLocale from "@/locales/ru.json";

const ru = (ruLocale as any).default ?? ruLocale;
const en = (enLocale as any).default ?? enLocale;

const i18nextInstance = i18next.createInstance();

const initPromise = i18nextInstance
  .init({
    preload: ['en', 'ru'],
    fallbackLng: 'en',
    lng: 'en',
    resources: {
      en: {trasnlation: en},
      ru: {translation: ru},
    },
    interpolation: {
      escapeValue: false
    },
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

