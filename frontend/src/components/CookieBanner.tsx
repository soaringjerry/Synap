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
    <div className="cookie-banner" role="dialog" aria-modal="false" aria-labelledby="cookie-title">
      <div className="cookie-glow" aria-hidden />
      <div className="cookie-head">
        <div className="cookie-icon" aria-hidden>🍪</div>
        <div className="cookie-title-wrap">
          <div id="cookie-title" className="cookie-title">{t('cookie.title')}</div>
          <div className="cookie-sub muted">{t('cookie.desc')} <a href="/legal/privacy" className="btn btn-ghost cookie-link">{t('cookie.learn')}</a></div>
        </div>
      </div>
      <div className="cookie-body">
        <div className="cookie-options">
          <label className="switch"><input className="vh" type="checkbox" checked disabled /><span className="track" aria-hidden />{t('cookie.nec')}</label>
          <label className="switch"><input className="vh" type="checkbox" checked={analytics} onChange={e=>setAnalytics(e.target.checked)} /><span className="track" aria-hidden />{t('cookie.analytics')}</label>
          <label className="switch"><input className="vh" type="checkbox" checked={third} onChange={e=>setThird(e.target.checked)} /><span className="track" aria-hidden />{t('cookie.third')}</label>
        </div>
      </div>
      <div className="cookie-actions">
        <button className="btn" onClick={()=>{ save({necessary:true, analytics:false, thirdParty:false, ts:Date.now()}); setOpen(false) }}>{t('cookie.only')}</button>
        <button className="btn btn-ghost" onClick={()=>{ save({necessary:true, analytics, thirdParty:third, ts:Date.now()}); setOpen(false) }}>{t('cookie.save')}</button>
        <button className="btn btn-primary" onClick={()=>{ setAnalytics(true); setThird(true); save({necessary:true, analytics:true, thirdParty:true, ts:Date.now()}); setOpen(false) }}>{t('cookie.all')}</button>
      </div>
    </div>
  )
}
