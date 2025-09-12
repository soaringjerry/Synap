import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zh from './locales/zh.json'

export type Locale = 'en' | 'zh'
export const supported: Locale[] = ['en', 'zh']

export function detectLocale(): Locale {
  const fromParam = new URLSearchParams(location.search).get('lang')?.toLowerCase()
  const fromStorage = localStorage.getItem('lang')?.toLowerCase() || undefined
  const first = fromParam || fromStorage || navigator.language.toLowerCase()
  if (first.startsWith('zh')) return 'zh'
  return 'en'
}

export function initI18n() {
  const lng = detectLocale()
  i18n
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: 'en',
      resources: { en, zh },
      interpolation: { escapeValue: false },
      defaultNS: 'common'
    })
  return i18n
}

export { i18n }
