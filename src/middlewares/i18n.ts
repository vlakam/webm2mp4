import i18next, { TOptions } from "i18next";
import { BotContext } from "@/types";

import enLocale from "@/locales/en.json";
import ruLocale from "@/locales/ru.json";

type TranslationOptions = Omit<TOptions, "context"> & {
  context?: string;
};

const i18nextInstance = i18next.createInstance();

const initPromise = i18nextInstance.init({
  debug: true,
  fallbackLng: "en",
  lng: "en",
  resources: {
    en: { translation: enLocale },
    ru: { translation: ruLocale },
  },
  interpolation: {
    escapeValue: false,
  },
});

const getLocale = (ctx: BotContext): string =>
  ctx.from?.language_code?.split("-")[0] ?? "en";

const translateWithLocale = (
  locale: string,
  key: string,
  options?: TranslationOptions
) => {
  const tOptions: TranslationOptions = { ...options, lng: locale };

  return i18nextInstance.t(key, tOptions);
};

export const i18n = {
  t: (lng: string, key: string, options?: TranslationOptions): string =>
    translateWithLocale(lng, key, options),
  getLocale,
  ready: initPromise,
};
