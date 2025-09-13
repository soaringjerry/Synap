import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { adminListScales, adminCreateScale } from '../api/client'

export function Admin() {
  const { t } = useTranslation()
  const [scales, setScales] = useState<any[]>([])
  const [nameEn, setNameEn] = useState('')
  const [nameZh, setNameZh] = useState('')
  const [points, setPoints] = useState(5)
  const [msg, setMsg] = useState('')

  async function loadScales() {
    try {
      const { scales } = await adminListScales()
      setScales(scales)
    } catch (e: any) { setMsg(e.message||String(e)) }
  }
  useEffect(() => { loadScales() }, [])

  async function createScale() {
    setMsg('')
    try {
      const body = { name_i18n: { en: nameEn, zh: nameZh }, points }
      await adminCreateScale(body as any)
      setNameEn(''); setNameZh(''); setPoints(5); loadScales()
    } catch (e:any) { setMsg(e.message||String(e)) }
  }
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
      } else {
        setMsg(url)
      }
    } catch (e:any) { setMsg(e.message||String(e)) }
  }
  // Item creation is done within per-scale management page now.

  return (
    <div className="container">
      <div className="hero">
        <div className="glitch" data-text={t('admin_console')}>{t('admin_console')}</div>
        <div className="muted">{t('admin_console_sub')}</div>
      </div>
      <div className="row">
        <section className="card span-6">
          <h3 style={{marginTop:0}}>{t('create_scale')}</h3>
          <div className="item"><div className="label">{t('name_en')}</div><input className="input" value={nameEn} onChange={e=>setNameEn(e.target.value)} /></div>
          <div className="item"><div className="label">{t('name_zh')}</div><input className="input" value={nameZh} onChange={e=>setNameZh(e.target.value)} /></div>
          <div className="item"><div className="label">{t('points')}</div><input className="input" type="number" min={2} max={9} value={points} onChange={e=>setPoints(parseInt(e.target.value||'5'))} /></div>
          <button className="btn btn-primary" onClick={createScale}>{t('create')}</button>
        </section>
        {/* Per-item add/edit is available in per-scale management */}
      </div>
      <div className="row" style={{marginTop:16}}>
        <section className="card span-12">
          <h3 style={{marginTop:0}}>{t('your_scales')}</h3>
          {scales.length===0 && <div className="muted">{t('no_scales')}</div>}
          {scales.map((s:any)=>(
            <div key={s.id} className="item" style={{display:'flex',justifyContent:'space-between', alignItems:'center'}}>
              <div><b>{s.id}</b> · {(s.name_i18n?.en||'')}{s.name_i18n?.zh?` / ${s.name_i18n.zh}`:''} · {s.points} {t('points')}</div>
              <div style={{display:'flex',gap:8}}>
                <a className="neon-btn" href={`/api/export?format=long&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_long_csv')}</a>
                <a className="neon-btn" href={`/api/export?format=wide&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_wide_csv')}</a>
                <a className="neon-btn" href={`/api/export?format=score&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_score_csv')}</a>
                <button className="btn" onClick={()=>copyLink(s.id)}>{t('share')}</button>
                <a className="btn btn-ghost" href={shareLink(s.id)} target="_blank" rel="noreferrer">{t('open')}</a>
                <Link className="btn btn-primary" to={`/admin/scale/${encodeURIComponent(s.id)}`}>{t('manage')||'Manage'}</Link>
              </div>
            </div>
          ))}
        </section>
      </div>
      {msg && <div className="muted" style={{marginTop:12}}>{msg}</div>}
    </div>
  )
}
