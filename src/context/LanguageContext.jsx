import { useState, useCallback, useEffect } from 'react';
import { translations, isRtl } from '../i18n/translations';
import { LanguageContext } from './LanguageContextInstance.js';

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('vipo-lang') || 'he';
    } catch {
      return 'en';
    }
  });

  const changeLang = useCallback((newLang) => {
    if (translations[newLang]) {
      setLang(newLang);
      try { localStorage.setItem('vipo-lang', newLang); } catch { /* */ }
    }
  }, []);

  const t = useCallback((key) => {
    return translations[lang]?.[key] || translations.en?.[key] || key;
  }, [lang]);

  const rtl = isRtl(lang);
  const dir = rtl ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
  }, [dir, lang]);

  return (
    <LanguageContext.Provider value={{ lang, changeLang, t, rtl, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}
