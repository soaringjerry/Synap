import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminGetScale, adminGetScaleItems, adminUpdateScale, adminDeleteScale, adminUpdateItem, adminDeleteItem, adminCreateItem, adminAnalyticsSummary } from '../api/client'

export function AdminScale() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const [scale, setScale] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [newStemEn, setNewStemEn] = useState('')
  const [newStemZh, setNewStemZh] = useState('')
  const [newReverse, setNewReverse] = useState(false)
  const [shareLang, setShareLang] = useState<'en'|'zh'>('en')
  const [analytics, setAnalytics] = useState<any|null>(null)

  async function load() {
    setMsg('')
    try {
      const s = await adminGetScale(id)
      const its = await adminGetScaleItems(id)
      setScale(s)
      setItems(its.items||[])
      try { const a = await adminAnalyticsSummary(id); setAnalytics(a) } catch {}
    } catch (e:any) { setMsg(e.message||String(e)) }
  }
  useEffect(()=>{ load() }, [id])

  async function saveScale() {
    try {
      setSaving(true)
      await adminUpdateScale(id, { name_i18n: scale.name_i18n, points: scale.points, randomize: !!scale.randomize, consent_i18n: scale.consent_i18n })
      setMsg(t('saved'))
    } catch(e:any) { setMsg(e.message||String(e)) } finally { setSaving(false) }
  }

  async function removeScale() {
    if (!confirm(t('confirm_delete_scale'))) return
    try { await adminDeleteScale(id); setMsg(t('deleted')); setScale(null); setItems([]) } catch(e:any) { setMsg(e.message||String(e)) }
  }

  async function saveItem(it:any) {
    try { await adminUpdateItem(it.id, { reverse_scored: !!it.reverse_scored, stem_i18n: it.stem_i18n }); setMsg(t('saved')) } catch(e:any) { setMsg(e.message||String(e)) }
  }
  async function removeItem(itemId:string) {
    if (!confirm(t('confirm_delete_item'))) return
    try { await adminDeleteItem(itemId); setItems(items.filter(x=>x.id!==itemId)); setMsg(t('deleted')) } catch(e:any) { setMsg(e.message||String(e)) }
  }
  async function addItem() {
    try {
      const res = await adminCreateItem({ scale_id: id, reverse_scored: newReverse, stem_i18n: { en: newStemEn, zh: newStemZh } })
      setItems([...items, res])
      setNewStemEn(''); setNewStemZh(''); setNewReverse(false)
    } catch(e:any) { setMsg(e.message||String(e)) }
  }

  if (!scale) return <div className="card span-12"><div className="muted">{t('loading')}…</div>{msg && <div className="muted">{msg}</div>}</div>

  return (
    <div className="container">
      <div className="row">
        <section className="card span-12">
          <h3 style={{marginTop:0}}>{t('participant_link')||'Participant Link'}</h3>
          <div className="item" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <div className="label">{t('language')}</div>
            <select className="select" style={{maxWidth:160}} value={shareLang} onChange={e=> setShareLang((e.target.value as any))}>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
            <input className="input" readOnly value={`${window.location.origin}/survey/${encodeURIComponent(id)}${shareLang?`?lang=${shareLang}`:''}`} />
            <button className="btn" onClick={async()=>{
              const url = `${window.location.origin}/survey/${encodeURIComponent(id)}${shareLang?`?lang=${shareLang}`:''}`
              try { await navigator.clipboard.writeText(url); setMsg(t('copied') as string) } catch { setMsg(url) }
            }}>{t('copy')||'Copy'}</button>
            <a className="btn btn-ghost" href={`${window.location.origin}/survey/${encodeURIComponent(id)}${shareLang?`?lang=${shareLang}`:''}`} target="_blank" rel="noreferrer">{t('open')||'Open'}</a>
          </div>
          <div className="muted">{t('share_desc')||'Share this URL with participants. The link opens the survey directly.'}</div>
        </section>
      </div>
      <div className="row">
        <section className="card span-12">
          <h3 style={{marginTop:0}}>{t('manage_scale')}: <b>{id}</b></h3>
          <div className="row">
            <div className="card span-6">
              <div className="item"><div className="label">{t('name_en')}</div>
                <input className="input" value={scale.name_i18n?.en||''} onChange={e=> setScale((s:any)=> ({...s, name_i18n: {...(s.name_i18n||{}), en: e.target.value }}))} />
              </div>
              <div className="item"><div className="label">{t('name_zh')}</div>
                <input className="input" value={scale.name_i18n?.zh||''} onChange={e=> setScale((s:any)=> ({...s, name_i18n: {...(s.name_i18n||{}), zh: e.target.value }}))} />
              </div>
              <div className="item"><div className="label">{t('points')}</div>
                <input className="input" type="number" min={2} max={9} value={scale.points||5} onChange={e=> setScale((s:any)=> ({...s, points: parseInt(e.target.value||'5')}))} />
              </div>
              <div className="item"><label><input className="checkbox" type="checkbox" checked={!!scale.randomize} onChange={e=> setScale((s:any)=> ({...s, randomize: e.target.checked}))} /> {t('randomize_items')||'Randomize items'}</label></div>
              <div className="cta-row" style={{marginTop:12}}>
                <button className="btn btn-primary" onClick={saveScale} disabled={saving}>{t('save')}</button>
                <button className="btn btn-ghost" onClick={removeScale}>{t('delete')}</button>
              </div>
            </div>
            <div className="card span-6">
              <h4 style={{marginTop:0}}>{t('add_item')}</h4>
              <div className="item"><div className="label">{t('stem_en')}</div>
                <input className="input" value={newStemEn} onChange={e=>setNewStemEn(e.target.value)} />
              </div>
              <div className="item"><div className="label">{t('stem_zh')}</div>
                <input className="input" value={newStemZh} onChange={e=>setNewStemZh(e.target.value)} />
              </div>
              <div className="item"><label><input className="checkbox" type="checkbox" checked={newReverse} onChange={e=>setNewReverse(e.target.checked)} /> {t('reverse_scored')}</label></div>
              <button className="btn btn-primary" onClick={addItem}>{t('add')}</button>
            </div>
            <div className="card span-6">
              <h4 style={{marginTop:0}}>{t('consent_custom')||'Consent'}</h4>
              <div className="item"><div className="label">{t('consent_en')||'Consent (EN)'}</div>
                <textarea className="input" rows={6} value={scale.consent_i18n?.en||''} onChange={e=> setScale((s:any)=> ({...s, consent_i18n: {...(s.consent_i18n||{}), en: e.target.value }}))} />
              </div>
              <div className="item"><div className="label">{t('consent_zh')||'Consent (ZH)'}</div>
                <textarea className="input" rows={6} value={scale.consent_i18n?.zh||''} onChange={e=> setScale((s:any)=> ({...s, consent_i18n: {...(s.consent_i18n||{}), zh: e.target.value }}))} />
              </div>
              <div className="muted">{t('consent_hint')||'Optional, leave blank to use default consent text. Newlines preserved.'}</div>
            </div>
          </div>
        </section>
      </div>

      <div className="row" style={{marginTop:16}}>
        <section className="card span-12">
          <h3 style={{marginTop:0}}>{t('analytics')||'Analytics'}</h3>
          {!analytics && <div className="muted">{t('loading')}…</div>}
          {analytics && (
            <>
              <div className="item" style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}}>
                <div><b>α</b>: {analytics.alpha?.toFixed(3)} (n={analytics.n})</div>
                <div>{t('total_responses')||'Total responses'}: <b>{analytics.total_responses}</b></div>
              </div>
              {/* Timeseries */}
              <div className="item">
                <div className="label">{t('responses_over_time')||'Responses over time'}</div>
                {/* Simple sparkline as counts */}
                <div style={{display:'flex',gap:6,alignItems:'flex-end'}}>
                  {analytics.timeseries.map((d:any)=>(
                    <div key={d.date} title={`${d.date}: ${d.count}`} style={{width:6,height:Math.max(3, d.count*6), background:'linear-gradient(180deg,#22d3ee,#a78bfa)', borderRadius:2}} />
                  ))}
                </div>
              </div>
              {/* Heatmap item x score */}
              <div className="item">
                <div className="label">{t('item_score_heatmap')||'Item × score heatmap'}</div>
                <div style={{overflowX:'auto'}}>
                  {/* Build table-like heatmap using CSS grid (reuse .heatmap styles) */}
                  <div style={{display:'grid', gridTemplateColumns:`180px repeat(${analytics.points}, 1fr)`, gap:8, alignItems:'center'}}>
                    <div />
                    {Array.from({length: analytics.points}, (_,i)=> (
                      <div key={i} className="muted" style={{textAlign:'center'}}>{i+1}</div>
                    ))}
                    {analytics.items.map((it:any)=> (
                      <React.Fragment key={it.id}>
                        <div className="muted" style={{minWidth:0,overflow:'hidden',textOverflow:'ellipsis'}}>{it.stem_i18n?.en || it.id}</div>
                        {it.histogram.map((v:number,ci:number)=> (
                          <div key={`${it.id}-${ci}`} title={`${v}`} style={{height:18, borderRadius:3, background:`hsla(${200+(v/Math.max(1,it.total))*80},90%,55%,${0.15+0.85*(v/Math.max(1,it.total))})`}} />
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="row" style={{marginTop:16}}>
        <section className="card span-12">
          <h3 style={{marginTop:0}}>{t('your_items')||'Items'}</h3>
          {items.length===0 && <div className="muted">{t('no_items')||'No items yet.'}</div>}
          {items.map((it:any)=> (
            <div key={it.id} className="item" style={{borderTop:'1px solid var(--border)', paddingTop:12, marginTop:8}}>
              <div className="muted">ID: <b>{it.id}</b></div>
              <div className="item"><div className="label">{t('stem_en')}</div>
                <input className="input" value={it.stem_i18n?.en||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, stem_i18n: {...(x.stem_i18n||{}), en: e.target.value }}:x))} />
              </div>
              <div className="item"><div className="label">{t('stem_zh')}</div>
                <input className="input" value={it.stem_i18n?.zh||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, stem_i18n: {...(x.stem_i18n||{}), zh: e.target.value }}:x))} />
              </div>
              <div className="item"><label><input className="checkbox" type="checkbox" checked={!!it.reverse_scored} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, reverse_scored: e.target.checked }:x))} /> {t('reverse_scored')}</label></div>
              <div className="cta-row">
                <button className="btn" onClick={()=> saveItem(items.find(x=>x.id===it.id))}>{t('save')}</button>
                <button className="btn btn-ghost" onClick={()=> removeItem(it.id)}>{t('delete')}</button>
              </div>
            </div>
          ))}
        </section>
      </div>
      {msg && <div className="muted" style={{marginTop:8}}>{msg}</div>}
    </div>
  )
}
