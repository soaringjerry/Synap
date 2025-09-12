// Minimal i18n bootstrap (placeholder). In real app, install i18next/react-i18next.
// This file sketches how to initialize and switch language.

export type Locale = 'en' | 'zh';

export const supported: Locale[] = ['en', 'zh'];

export function detectLocale(paramLang?: string): Locale {
  const fromParam = (paramLang || '').toLowerCase();
  if (fromParam.startsWith('zh')) return 'zh';
  if (fromParam.startsWith('en')) return 'en';
  if (typeof navigator !== 'undefined') {
    const n = (navigator.language || navigator.languages?.[0] || '').toLowerCase();
    if (n.startsWith('zh')) return 'zh';
  }
  return 'en';
}

// Example usage:
// const lang = detectLocale(new URLSearchParams(location.search).get('lang') || localStorage.getItem('lang') || undefined);
// i18n.init({ lng: lang, resources: { en: {...}, zh: {...} } })

