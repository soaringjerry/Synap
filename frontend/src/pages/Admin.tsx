import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

async function authed(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem('token')
  init.headers = { ...(init.headers||{}), 'Authorization': token ? `Bearer ${token}` : '' }
  const res = await fetch(path, init)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function Admin() {
  const { t } = useTranslation()
  const [scales, setScales] = useState<any[]>([])
  const [nameEn, setNameEn] = useState('')
  const [nameZh, setNameZh] = useState('')
  const [points, setPoints] = useState(5)
  const [scaleId, setScaleId] = useState('')
  const [stemEn, setStemEn] = useState('')
  const [stemZh, setStemZh] = useState('')
  const [reverse, setReverse] = useState(false)
  const [msg, setMsg] = useState('')

  async function loadScales() {
    try {
      const { scales } = await authed('/api/admin/scales')
      setScales(scales)
    } catch (e: any) { setMsg(e.message||String(e)) }
  }
  useEffect(() => { loadScales() }, [])

  async function createScale() {
    setMsg('')
    try {
      const body = { name_i18n: { en: nameEn, zh: nameZh }, points }
      const sc = await authed('/api/scales', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      setScaleId(sc.id); setNameEn(''); setNameZh(''); setPoints(5); loadScales()
    } catch (e:any) { setMsg(e.message||String(e)) }
  }
  async function createItem() {
    setMsg('')
    try {
      const body = { scale_id: scaleId, reverse_scored: reverse, stem_i18n: { en: stemEn, zh: stemZh } }
      await authed('/api/items', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      setStemEn(''); setStemZh(''); setReverse(false)
    } catch (e:any) { setMsg(e.message||String(e)) }
  }

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
        <section className="card span-6 offset">
          <h3 style={{marginTop:0}}>{t('add_item')}</h3>
          <div className="item"><div className="label">{t('scale_id')}</div><input className="input" value={scaleId} onChange={e=>setScaleId(e.target.value)} placeholder={t('scale_id_placeholder')} /></div>
          <div className="item"><div className="label">{t('stem_en')}</div><input className="input" value={stemEn} onChange={e=>setStemEn(e.target.value)} /></div>
          <div className="item"><div className="label">{t('stem_zh')}</div><input className="input" value={stemZh} onChange={e=>setStemZh(e.target.value)} /></div>
          <div className="item"><label><input className="checkbox" type="checkbox" checked={reverse} onChange={e=>setReverse(e.target.checked)} /> {t('reverse_scored')}</label></div>
          <button className="btn btn-primary" onClick={createItem}>{t('add')}</button>
        </section>
      </div>
      <div className="row" style={{marginTop:16}}>
        <section className="card span-12">
          <h3 style={{marginTop:0}}>{t('your_scales')}</h3>
          {scales.length===0 && <div className="muted">{t('no_scales')}</div>}
          {scales.map((s:any)=>(
            <div key={s.id} className="item" style={{display:'flex',justifyContent:'space-between', alignItems:'center'}}>
              <div><b>{s.id}</b> · {(s.name_i18n?.en||'')}{s.name_i18n?.zh?` / ${s.name_i18n.zh}`:''} · {s.points} points</div>
              <div style={{display:'flex',gap:8}}>
                <a className="neon-btn" href={`/api/export?format=long&scale_id=${encodeURIComponent(s.id)}`} target="_blank">Export Long</a>
                <a className="neon-btn" href={`/api/export?format=wide&scale_id=${encodeURIComponent(s.id)}`} target="_blank">Export Wide</a>
                <a className="neon-btn" href={`/api/export?format=score&scale_id=${encodeURIComponent(s.id)}`} target="_blank">Export Score</a>
              </div>
            </div>
          ))}
        </section>
      </div>
      {msg && <div className="muted" style={{marginTop:12}}>{msg}</div>}
    </div>
  )
}
