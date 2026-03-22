import { createContext, useContext } from 'react';
import { type Dictionary, type LangCode, dictionaries } from '@/i18n/dictionaries';

export interface I18nContextValue {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: Dictionary;
}

export const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => {},
  t: dictionaries.en,
});

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
