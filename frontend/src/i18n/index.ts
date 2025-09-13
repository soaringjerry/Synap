import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zh from './locales/zh.json'

export type Locale = 'en' | 'zh'
export const supported: Locale[] = ['en', 'zh']

export function detectLocale(): Locale {
  const param = new URLSearchParams(location.search).get('lang')?.toLowerCase()
  const stored = localStorage.getItem('lang')?.toLowerCase()
  // If URL specifies a concrete language, honor it.
  if (param && param !== 'auto') {
    return param.startsWith('zh') ? 'zh' : 'en'
  }
  // If URL explicitly requests auto, prefer UA over stored value.
  if (param === 'auto') {
    const ua = navigator.language.toLowerCase()
    return ua.startsWith('zh') ? 'zh' : 'en'
  }
  // Otherwise fallback to stored preference, then UA
  const first = stored || navigator.language.toLowerCase()
  return first.startsWith('zh') ? 'zh' : 'en'
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
