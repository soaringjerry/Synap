import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { adminListScales, adminDeleteScale } from '../api/client'
import { useToast } from '../components/Toast'

export function Admin() {
  const { t } = useTranslation()
  const toast = useToast()
  const [scales, setScales] = useState<any[]>([])
  const [msg, setMsg] = useState('')

  async function loadScales() {
    try {
      const { scales } = await adminListScales()
      setScales(scales)
    } catch (e: any) { setMsg(e.message||String(e)) }
  }
  useEffect(() => { loadScales() }, [])

  // Creation flow moved to the dedicated editor view.
  function shareLink(id: string, lang?: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/survey/${encodeURIComponent(id)}${lang?`?lang=${lang}`:''}`
  }
  async function copyLink(id: string) {
    try {
      const url = shareLink(id)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setMsg(t('copied') as string)
        toast.success(t('copied')||'Copied')
      } else {
        setMsg(url)
      }
    } catch (e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }
  // Item creation is done within per-scale management page now.

  return (
    <div className="container">
      <div className="hero">
        <div className="glitch" data-text={t('admin_console')}>{t('admin_console')}</div>
        <div className="muted">{t('admin_console_sub')}</div>
      </div>
      <div className="row">
        <section className="card span-12">
          <h3 style={{marginTop:0}}>{t('create_scale')}</h3>
          <div className="tile" style={{padding:16, marginBottom:12}}>
            <div className="muted" style={{marginBottom:8}}>{t('admin.create_flow_hint')||'Start with the essentials. Provide a name and point scale, then fine-tune consent, encryption, and pagination inside Settings after creation.'}</div>
            <div className="cta-row" style={{justifyContent:'flex-start', gap:12}}>
              <Link className="btn btn-primary" to="/admin/scale/new">{t('editor.create_button')}</Link>
              <Link className="btn btn-ghost" to="/admin/scale/new" target="_blank" rel="noreferrer">{t('open')}</Link>
            </div>
          </div>
          <div className="muted">{t('admin.create_followup_hint')||'Tip: consent text, interactive confirmations, Turnstile, and E2EE live in the new editor under Settings → Consent/Security.'}</div>
        </section>
      </div>
      <div className="row" style={{marginTop:16}}>
        <section className="card span-12">
          <h3 style={{marginTop:0}}>{t('your_scales')}</h3>
          {scales.length===0 && (
            <div className="tile" style={{padding:12}}>
              <div className="muted" style={{marginBottom:8}}>{t('no_scales')}</div>
              <div className="label">Checklist</div>
              <ul className="kv-list">
                <li>✅ {t('admin.checklist_create')||'Create your first scale'}</li>
                <li>✅ {t('admin.checklist_settings')||'Open Settings to configure consent, encryption, pagination'}</li>
                <li>✅ {t('admin.checklist_share')||'Share the participant link and collect a test response'}</li>
                <li>✅ {t('admin.checklist_export')||'Try the Share & Results exports (local decrypt for E2EE projects)'}</li>
              </ul>
            </div>
          )}
          {scales.map((s:any)=>(
            <div key={s.id} className="item" style={{display:'flex',justifyContent:'space-between', alignItems:'center'}}>
              <div><b>{s.id}</b> · {(s.name_i18n?.en||'')}{s.name_i18n?.zh?` / ${s.name_i18n.zh}`:''} · {s.points} {t('points')}</div>
              <div style={{display:'flex',gap:8}}>
                {!s.e2ee_enabled ? (
                  <>
                    <a className="neon-btn" href={`/api/export?format=long&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_long_csv')}</a>
                    <a className="neon-btn" href={`/api/export?format=wide&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_wide_csv')}</a>
                    <a className="neon-btn" href={`/api/export?format=score&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_score_csv')}</a>
                  </>
                ) : (
                  <div className="muted" title={t('e2ee.csv_disabled_title')||'CSV exports are disabled when end‑to‑end encryption is ON'}>{t('e2ee.csv_disabled')||'CSV disabled (end-to-end encryption)'}</div>
                )}
                <button className="btn" onClick={()=>copyLink(s.id)}>{t('share')}</button>
                <a className="btn btn-ghost" href={shareLink(s.id)} target="_blank" rel="noreferrer">{t('open')}</a>
                <Link className="btn btn-primary" to={`/admin/scale/${encodeURIComponent(s.id)}`}>{t('manage')||'Manage'}</Link>
                <Link className="btn" to={`/admin/scale/${encodeURIComponent(s.id)}/legacy`}>{t('editor.legacy_view')||'旧版视图'}</Link>
                <button className="btn btn-ghost" onClick={async()=>{
                  if (!confirm(t('confirm_delete_scale')||'Delete this scale and all its items/responses?')) return
                  try {
                    await adminDeleteScale(s.id)
                    setMsg(t('deleted') as string)
                    toast.success(t('delete_success')||t('deleted')||'Deleted')
                    loadScales()
                  } catch (error) {
                    const errMessage = (error as any)?.message || String(error)
                    setMsg(errMessage)
                    toast.error(errMessage)
                  }
                }}>{t('delete')||'Delete'}</button>
              </div>
            </div>
          ))}
        </section>
      </div>
      {msg && <div className="muted" style={{marginTop:12}}>{msg}</div>}
    </div>
  )
}
