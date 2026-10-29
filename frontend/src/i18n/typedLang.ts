import { useLang as useLangUntyped } from './LangContext';

/** Typed view of the existing (plain JS) language context, for the .tsx files. */
export interface LangApi {
  lang: 'en' | 'sr';
  setLang: (lang: 'en' | 'sr') => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, ...args: any[]) => string;
}

export function useLang(): LangApi {
  return useLangUntyped() as unknown as LangApi;
}
