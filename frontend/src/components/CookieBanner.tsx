import React, {useEffect, useState} from 'react'

type Consent = { necessary: true; analytics: boolean; thirdParty: boolean; ts: number }
const KEY = 'cookieConsent'

function getSaved(): Consent | null {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

function save(c: Consent) { localStorage.setItem(KEY, JSON.stringify(c)); (window as any).synapConsent = c }

export function CookieBanner() {
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
        <b>Cookies</b> · We use necessary cookies to run the site. You can opt in to analytics or third‑party cookies.
        <div className="cookie-options">
          <label><input type="checkbox" checked disabled /> Necessary</label>
          <label><input type="checkbox" checked={analytics} onChange={e=>setAnalytics(e.target.checked)} /> Analytics</label>
          <label><input type="checkbox" checked={third} onChange={e=>setThird(e.target.checked)} /> 3rd‑party</label>
        </div>
      </div>
      <div className="cookie-actions">
        <button className="btn" onClick={()=>{ save({necessary:true, analytics:false, thirdParty:false, ts:Date.now()}); setOpen(false) }}>Only necessary</button>
        <button className="btn btn-ghost" onClick={()=>{ save({necessary:true, analytics, thirdParty:third, ts:Date.now()}); setOpen(false) }}>Save</button>
      </div>
    </div>
  )
}

