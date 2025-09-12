"use client"
import { useTranslations } from 'next-intl'
import { useThemeStore } from '../../../features/theme/store'

export default function SettingsPage() {
  const t = useTranslations('settings')
  const { theme, neon, motion, setTheme, setNeon, setMotion } = useThemeStore()
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <section className="card">
        <h3 className="text-xl font-display">{t('themes.title')}</h3>
        <div className="mt-2 flex gap-2">
          <button className="btn" aria-pressed={theme==='dark'} onClick={()=>setTheme('dark')}>{t('themes.dark')}</button>
          <button className="btn" aria-pressed={theme==='light'} onClick={()=>setTheme('light')}>{t('themes.light')}</button>
        </div>
      </section>
      <section className="card">
        <h3 className="text-xl font-display">{t('neon.title')}</h3>
        <div className="mt-2 flex gap-2">
          {(['low','medium','high'] as const).map(level => (
            <button key={level} className="btn" aria-pressed={neon===level} onClick={()=>setNeon(level)}>{t(`neon.${level}`)}</button>
          ))}
        </div>
      </section>
      <section className="card">
        <h3 className="text-xl font-display">{t('motion.title')}</h3>
        <div className="mt-2 flex gap-2">
          {(['off','low','on'] as const).map(level => (
            <button key={level} className="btn" aria-pressed={motion===level} onClick={()=>setMotion(level)}>{t(`motion.${level}`)}</button>
          ))}
        </div>
      </section>
    </div>
  )
}

