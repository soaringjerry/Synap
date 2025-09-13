import React, {useEffect, useState} from 'react'
import { useTranslation } from 'react-i18next'

type Consent = { necessary: true; analytics: boolean; thirdParty: boolean; ts: number }
const KEY = 'cookieConsent'

function getSaved(): Consent | null {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

function save(c: Consent) { localStorage.setItem(KEY, JSON.stringify(c)); (window as any).synapConsent = c }

export function CookieBanner() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [third, setThird] = useState(false)

  useEffect(() => {
    const s = getSaved()
    if (!s) setOpen(true); else (window as any).synapConsent = s
    ;(window as any).openCookiePrefs = () => setOpen(true)
  }, [])

  if (!open) return null
  return (
    <div className="cookie-banner">
      <div className="cookie-text">
        <b>{t('cookie.title')}</b> · {t('cookie.desc')} <a href="/legal/privacy" className="btn btn-ghost" style={{marginLeft:8, padding:'4px 8px'}}>{t('cookie.learn')}</a>
        <div className="cookie-options">
          <label><input type="checkbox" checked disabled /> {t('cookie.nec')}</label>
          <label><input type="checkbox" checked={analytics} onChange={e=>setAnalytics(e.target.checked)} /> {t('cookie.analytics')}</label>
          <label><input type="checkbox" checked={third} onChange={e=>setThird(e.target.checked)} /> {t('cookie.third')}</label>
        </div>
      </div>
      <div className="cookie-actions">
        <button className="btn" onClick={()=>{ save({necessary:true, analytics:false, thirdParty:false, ts:Date.now()}); setOpen(false) }}>{t('cookie.only')}</button>
        <button className="btn btn-ghost" onClick={()=>{ save({necessary:true, analytics, thirdParty:third, ts:Date.now()}); setOpen(false) }}>{t('cookie.save')}</button>
      </div>
    </div>
  )
}
