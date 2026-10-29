import { createContext, useContext, useState, useCallback } from 'react';
import { translations, dayLabels } from './translations';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('servicehub_lang') || 'en');

  const changeLang = useCallback((newLang) => {
    localStorage.setItem('servicehub_lang', newLang);
    setLang(newLang);
  }, []);

  const t = useCallback((key, ...args) => {
    const dict = translations[lang] || translations.en;
    const entry = dict[key] ?? translations.en[key];
    if (typeof entry === 'function') return entry(...args);
    return entry ?? key; // fall back to the key itself so a missing translation is visible, not blank
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang: changeLang, t, dayLabels: dayLabels[lang] || dayLabels.en }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within LangProvider');
  return ctx;
}
