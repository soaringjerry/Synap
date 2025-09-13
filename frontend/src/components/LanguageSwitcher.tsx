import React from 'react'
import { useTranslation } from 'react-i18next'

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const lang = i18n.language.startsWith('zh') ? 'zh' : 'en'
  return (
    <select
      aria-label={t('language')}
      value={lang}
      onChange={(e) => {
        const v = e.target.value as 'en' | 'zh'
        i18n.changeLanguage(v)
        localStorage.setItem('lang', v)
        // keep URL param consistent if used
        const url = new URL(window.location.href)
        url.searchParams.set('lang', v)
        window.history.replaceState({}, '', url.toString())
      }}
      className="neon-btn lang-switcher"
    >
      <option value="en">{t('lang_en')}</option>
      <option value="zh">{t('lang_zh')}</option>
    </select>
  )
}
