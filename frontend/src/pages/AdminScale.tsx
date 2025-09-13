import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminGetScale, adminGetScaleItems, adminUpdateScale, adminDeleteScale, adminUpdateItem, adminDeleteItem, adminCreateItem } from '../api/client'

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

  async function load() {
    setMsg('')
    try {
      const s = await adminGetScale(id)
      const its = await adminGetScaleItems(id)
      setScale(s)
      setItems(its.items||[])
    } catch (e:any) { setMsg(e.message||String(e)) }
  }
  useEffect(()=>{ load() }, [id])

  async function saveScale() {
    try {
      setSaving(true)
      await adminUpdateScale(id, { name_i18n: scale.name_i18n, points: scale.points, randomize: !!scale.randomize })
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
          </div>
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

