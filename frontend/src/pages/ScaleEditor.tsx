import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useToast } from '../components/Toast'
import {
  adminGetScale,
  adminGetScaleItems,
  adminUpdateScale,
  adminUpdateItem,
  adminDeleteItem,
  adminCreateItem,
  adminAnalyticsSummary,
  adminReorderItems,
  adminGetAIConfig,
  adminAITranslatePreview,
} from '../api/client'

type View = 'editor' | 'settings' | 'share'

export function ScaleEditor() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const toast = useToast()

  // Global state
  const [scale, setScale] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [activeView, setActiveView] = useState<View>('editor')

  // Selection for right-pane editor
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const selectedItem = useMemo(() => items.find(x => x.id === selectedItemId) || null, [items, selectedItemId])

  // New item form state (when adding)
  const [newOpen, setNewOpen] = useState(false)
  const [newStemEn, setNewStemEn] = useState('')
  const [newStemZh, setNewStemZh] = useState('')
  const [newReverse, setNewReverse] = useState(false)
  const [newType, setNewType] = useState<'likert'|'single'|'multiple'|'dropdown'|'rating'|'short_text'|'long_text'|'numeric'|'date'|'time'|'slider'>('likert')
  const [newRequired, setNewRequired] = useState(false)
  const [newOptsEn, setNewOptsEn] = useState('')
  const [newOptsZh, setNewOptsZh] = useState('')
  const [newMin, setNewMin] = useState('')
  const [newMax, setNewMax] = useState('')
  const [newStep, setNewStep] = useState('')
  const [newPhEn, setNewPhEn] = useState('')
  const [newPhZh, setNewPhZh] = useState('')

  // Likert defaults (per-scale) and per-item controls
  const [likertLabelsEn, setLikertLabelsEn] = useState<string>('')
  const [likertLabelsZh, setLikertLabelsZh] = useState<string>('')
  const [likertShowNumbers, setLikertShowNumbers] = useState<boolean>(true)
  const [likertPreset, setLikertPreset] = useState<string>('numeric')

  // Settings view specific state
  const [turnstile, setTurnstile] = useState<boolean>(false)
  const [itemsPerPage, setItemsPerPage] = useState<string>('0')
  const [consentVersion, setConsentVersion] = useState('v1')
  const [signatureRequired, setSignatureRequired] = useState(true)
  const [consentOptions, setConsentOptions] = useState<{ key:string; required:boolean; en?:string; zh?:string }[]>([])

  // Share & analytics
  const [analytics, setAnalytics] = useState<any | null>(null)
  // AI translate
  const [aiTargets, setAiTargets] = useState('zh')
  const [aiPreview, setAiPreview] = useState<any|null>(null)
  const [aiMsg, setAiMsg] = useState('')
  const [aiReady, setAiReady] = useState(false)
  const [aiWorking, setAiWorking] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    setMsg('')
    try {
      const s = await adminGetScale(id)
      const its = await adminGetScaleItems(id)
      setScale(s)
      setItems(its.items || [])
      // Likert defaults
      const labs = (s as any).likert_labels_i18n || {}
      setLikertLabelsEn((labs.en || []).join(', '))
      setLikertLabelsZh((labs.zh || []).join('，'))
      setLikertShowNumbers(!!(s as any).likert_show_numbers)
      setLikertPreset((s as any).likert_preset || 'numeric')
      // Basic settings
      setTurnstile(!!(s as any).turnstile_enabled)
      setItemsPerPage(String((s as any).items_per_page || 0))
      // Consent config
      const cc = (s as any).consent_config || {}
      setConsentVersion(cc.version || 'v1')
      setSignatureRequired(!!(cc.signature_required ?? true))
      const opts = (cc.options || []).map((o:any) => ({ key:o.key, required: !!o.required, en: o.label_i18n?.en, zh: o.label_i18n?.zh }))
      setConsentOptions(opts)
      try { const a = await adminAnalyticsSummary(id); setAnalytics(a) } catch {}
      try { const cfg = await adminGetAIConfig(); setAiReady(!!cfg.openai_key && !!cfg.allow_external) } catch {}
    } catch (e:any) { setMsg(e.message || String(e)) }
  }

  async function saveScale() {
    try {
      const labsEn = likertLabelsEn.split(/[,，]/).map(s=>s.trim()).filter(Boolean)
      const labsZh = likertLabelsZh.split(/[,，]/).map(s=>s.trim()).filter(Boolean)
      const likert_labels_i18n: any = {}
      if (labsEn.length) likert_labels_i18n.en = labsEn
      if (labsZh.length) likert_labels_i18n.zh = labsZh
      const ipp = parseInt(itemsPerPage||'0')
      await adminUpdateScale(id, {
        name_i18n: scale.name_i18n,
        points: scale.points,
        randomize: !!scale.randomize,
        consent_i18n: scale.consent_i18n,
        collect_email: scale.collect_email,
        e2ee_enabled: !!scale.e2ee_enabled,
        region: scale.region || 'auto',
        items_per_page: isNaN(ipp) ? 0 : ipp,
        turnstile_enabled: !!turnstile,
        likert_labels_i18n,
        likert_show_numbers: !!likertShowNumbers,
        likert_preset: likertPreset
      } as any)
      toast.success(t('save_success')||t('saved')||'Saved')
    } catch (e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }

  // Consent helpers (simple mode)
  function getOpt(key:string){ return consentOptions.find(o=> o.key===key) }
  function setOptRequired(key:string, v:boolean){
    setConsentOptions(list=> {
      const idx = list.findIndex(o=> o.key===key)
      if (idx===-1) return [...list, { key, required: v }]
      const a=[...list]; a[idx] = { ...a[idx], required: v }; return a
    })
  }
  async function saveConsentConfig() {
    try {
      const options = consentOptions.map(o=> ({ key:o.key.trim(), required: !!o.required, label_i18n: { en: o.en || undefined, zh: o.zh || undefined } }))
      await adminUpdateScale(id, { consent_config: { version: consentVersion||'v1', options, signature_required: !!signatureRequired } } as any)
      toast.success(t('save_success')||t('saved')||'Saved')
    } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }

  // Items CRUD
  async function saveItem(it:any) {
    try {
      const upd:any = { reverse_scored: !!it.reverse_scored, stem_i18n: it.stem_i18n, type: it.type, required: !!it.required }
      if (!it.type || it.type==='likert') {
        if (it.likert_labels_i18n) upd.likert_labels_i18n = it.likert_labels_i18n
        if (typeof it.likert_show_numbers==='boolean') upd.likert_show_numbers = !!it.likert_show_numbers
      }
      if (it.type==='single' || it.type==='multiple' || it.type==='dropdown') upd.options_i18n = it.options_i18n
      if (it.type==='rating' || it.type==='numeric' || it.type==='slider') { upd.min = it.min; upd.max = it.max; upd.step = it.step }
      if (it.type==='short_text' || it.type==='long_text') upd.placeholder_i18n = it.placeholder_i18n
      await adminUpdateItem(it.id, upd)
      toast.success(t('save_success')||t('saved')||'Saved')
      setItems(arr=> arr.map(x=> x.id===it.id? { ...x, ...upd }: x))
    } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }
  async function removeItem(itemId:string) {
    if (!confirm(t('confirm_delete_item')||'Delete this item?')) return
    try { await adminDeleteItem(itemId); setItems(items.filter(x=>x.id!==itemId)); toast.success(t('delete_success')||t('deleted')||'Deleted'); if (selectedItemId===itemId) setSelectedItemId(null) } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }
  async function addItem() {
    try {
      const payload: any = { scale_id: id, reverse_scored: newReverse, stem_i18n: { en: newStemEn, zh: newStemZh }, type: newType, required: newRequired }
      if (newType==='single' || newType==='multiple' || newType==='dropdown') {
        payload.options_i18n = { en: newOptsEn.split(/\n/).map(s=>s.trim()).filter(Boolean), zh: newOptsZh.split(/\n/).map(s=>s.trim()).filter(Boolean) }
      }
      if (newType==='likert') {
        const en = likertLabelsEn.split(/[,，]/).map(s=>s.trim()).filter(Boolean)
        const zh = likertLabelsZh.split(/[,，]/).map(s=>s.trim()).filter(Boolean)
        const ll: any = {}
        if (en.length) ll.en = en
        if (zh.length) ll.zh = zh
        if (Object.keys(ll).length>0) payload.likert_labels_i18n = ll
        payload.likert_show_numbers = !!likertShowNumbers
      }
      if (newType==='rating' || newType==='numeric' || newType==='slider') {
        if (newMin !== '') payload.min = Number(newMin)
        if (newMax !== '') payload.max = Number(newMax)
        if (newStep !== '') payload.step = Number(newStep)
      }
      if (newType==='short_text' || newType==='long_text') {
        payload.placeholder_i18n = { en: newPhEn, zh: newPhZh }
      }
      const res = await adminCreateItem(payload)
      setItems([...items, res])
      setNewStemEn(''); setNewStemZh(''); setNewReverse(false); setNewType('likert'); setNewRequired(false); setNewOptsEn(''); setNewOptsZh(''); setNewMin(''); setNewMax(''); setNewStep(''); setNewPhEn(''); setNewPhZh('')
      setNewOpen(false)
      toast.success(t('create_success')||'Created')
    } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }

  function shareLink(scaleId: string, lang?: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/survey/${encodeURIComponent(scaleId)}${lang?`?lang=${lang}`:''}`
  }
  async function copyLink(scaleId: string) {
    try {
      const url = shareLink(scaleId)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        toast.success(t('copied')||'Copied')
      } else { setMsg(url) }
    } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }

  // UI chunks
  function ItemsList() {
    return (
      <div className="card span-4">
        <div className="cta-row" style={{justifyContent:'space-between'}}>
          <div className="section-title">{t('your_items')||'Items'}</div>
          <div className="cta-row">
            <button className="btn" onClick={async()=>{ try { await adminReorderItems(id, items.map((x:any)=> x.id)); toast.success(t('save_success')||t('saved')||'Saved') } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) } }}>{t('save')||'Save'} order</button>
            <button className="btn btn-primary" onClick={()=> { setNewOpen(true); setSelectedItemId(null) }}>{t('add_item')||'Add item'}</button>
          </div>
        </div>
        {items.length===0 && <div className="muted">{t('no_items')||'No items yet.'}</div>}
        <div style={{marginTop:8}}>
          {items.map((it:any, idx:number)=> (
            <div key={it.id} className="tile" style={{padding:10, marginTop:8, border: selectedItemId===it.id? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius:12}}>
              <div className="cta-row" style={{justifyContent:'space-between'}}>
                <button className="btn btn-ghost" onClick={()=> setSelectedItemId(it.id)} style={{flex:1, justifyContent:'flex-start'}}>
                  <div style={{textAlign:'left'}}>
                    <div className="muted" style={{fontSize:12}}>{it.type||'likert'}</div>
                    <div style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{it.stem_i18n?.[i18n.language as 'en'|'zh'] || it.stem_i18n?.en || it.stem_i18n?.zh || it.id}</div>
                  </div>
                </button>
                <div className="cta-row">
                  <button className="btn btn-ghost" onClick={()=> setItems(arr=> { const a=[...arr]; if (idx<=0) return a; const t=a[idx]; a[idx]=a[idx-1]; a[idx-1]=t; return a })} disabled={idx===0}>↑</button>
                  <button className="btn btn-ghost" onClick={()=> setItems(arr=> { const a=[...arr]; if (idx>=arr.length-1) return a; const t=a[idx]; a[idx]=a[idx+1]; a[idx+1]=t; return a })} disabled={idx===items.length-1}>↓</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function ItemEditor() {
    if (selectedItem) {
      const it = selectedItem
      return (
        <div className="card span-8">
          <h4 style={{marginTop:0}}>{t('edit_item')||'Edit item'}</h4>
          <div className="muted">{t('label.id')||'ID'}: <b>{it.id}</b></div>
          <div className="item"><div className="label">{t('stem_en')}</div>
            <input className="input" value={it.stem_i18n?.en||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, stem_i18n: {...(x.stem_i18n||{}), en: e.target.value }}:x))} />
          </div>
          <div className="item"><div className="label">{t('stem_zh')}</div>
            <input className="input" value={it.stem_i18n?.zh||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, stem_i18n: {...(x.stem_i18n||{}), zh: e.target.value }}:x))} />
          </div>
          <div className="muted">{t('label.type')||'Type'}: <b>{it.type||'likert'}</b></div>
          {(it.type===undefined || it.type==='likert') && (
            <>
              <div className="item"><label><input className="checkbox" type="checkbox" checked={!!it.reverse_scored} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, reverse_scored: e.target.checked }:x))} /> {t('reverse_scored')}</label></div>
              <div className="item">
                <div className="label">Likert Anchors (this item)</div>
                <div className="row">
                  <div className="card span-6"><div className="label">EN</div><input className="input" value={(it as any).likert_labels_i18n?.en?.join(', ')||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, likert_labels_i18n: {...(((x as any).likert_labels_i18n)||{}), en: e.target.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder="Strongly disagree, Disagree, …" /></div>
                  <div className="card span-6"><div className="label">中文</div><input className="input" value={(it as any).likert_labels_i18n?.zh?.join('，')||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, likert_labels_i18n: {...(((x as any).likert_labels_i18n)||{}), zh: e.target.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder="非常不同意，…" /></div>
                </div>
                <label className="item" style={{display:'inline-flex',alignItems:'center',gap:8}}><input className="checkbox" type="checkbox" checked={!!(it as any).likert_show_numbers} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, likert_show_numbers: e.target.checked }:x))} /> Show numbers with labels</label>
              </div>
            </>
          )}
          {(it.type==='single' || it.type==='multiple' || it.type==='dropdown') && (
            <div className="item">
              <div className="label">{t('options_en')}</div>
              <textarea className="input" rows={3} value={(it as any).options_i18n?.en?.join('\n')||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, options_i18n: {...(((x as any).options_i18n)||{}), en: e.target.value.split(/\n/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder={'Option A\nOption B'} />
              <div className="label">{t('options_zh')}</div>
              <textarea className="input" rows={3} value={(it as any).options_i18n?.zh?.join('\n')||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, options_i18n: {...(((x as any).options_i18n)||{}), zh: e.target.value.split(/\n/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder={'选项一\n选项二'} />
            </div>
          )}
          {(it.type==='rating' || it.type==='numeric' || it.type==='slider') && (
            <div className="row">
              <div className="card span-4"><div className="label">Min</div><input className="input" type="number" value={(it.min??'') as any} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, min: e.target.value===''? undefined : Number(e.target.value) }:x))} /></div>
              <div className="card span-4"><div className="label">Max</div><input className="input" type="number" value={(it.max??'') as any} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, max: e.target.value===''? undefined : Number(e.target.value) }:x))} /></div>
              <div className="card span-4"><div className="label">Step</div><input className="input" type="number" value={(it.step??'') as any} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, step: e.target.value===''? undefined : Number(e.target.value) }:x))} /></div>
            </div>
          )}
          {(it.type==='short_text' || it.type==='long_text') && (
            <div className="row">
              <div className="card span-6"><div className="label">Placeholder (EN)</div><input className="input" value={(it as any).placeholder_i18n?.en||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, placeholder_i18n: {...(((x as any).placeholder_i18n)||{}), en: e.target.value }}:x))} /></div>
              <div className="card span-6"><div className="label">Placeholder (ZH)</div><input className="input" value={(it as any).placeholder_i18n?.zh||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, placeholder_i18n: {...(((x as any).placeholder_i18n)||{}), zh: e.target.value }}:x))} /></div>
            </div>
          )}
          <div className="item"><label><input className="checkbox" type="checkbox" checked={!!it.required} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, required: e.target.checked }:x))} /> {t('required')}</label></div>
          <div className="cta-row" style={{marginTop:8}}>
            <button className="btn btn-primary" onClick={()=> saveItem(it)}>{t('save')}</button>
            <button className="btn btn-ghost" onClick={()=> removeItem(it.id)}>{t('delete')}</button>
          </div>
        </div>
      )
    }
    if (newOpen) {
      return (
        <div className="card span-8">
          <h4 style={{marginTop:0}}>{t('add_item')||'Add item'}</h4>
          <div className="row">
            <div className="card span-12">
              <div className="row">
                <div className="card span-6"><div className="label">{t('stem_en')}</div><input className="input" value={newStemEn} onChange={e=> setNewStemEn(e.target.value)} /></div>
                <div className="card span-6"><div className="label">{t('stem_zh')}</div><input className="input" value={newStemZh} onChange={e=> setNewStemZh(e.target.value)} /></div>
              </div>
              <div className="row">
                <div className="card span-4"><div className="label">{t('label.type')||'Type'}</div>
                  <select className="select" value={newType} onChange={e=> setNewType(e.target.value as any)}>
                    {['likert','single','multiple','dropdown','rating','short_text','long_text','numeric','date','time','slider'].map(x=> <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div className="card span-4"><div className="label">{t('required')}</div><label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={newRequired} onChange={e=> setNewRequired(e.target.checked)} /> required</label></div>
                <div className="card span-4"><div className="label">{t('reverse_scored')}</div><label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={newReverse} onChange={e=> setNewReverse(e.target.checked)} /> reverse</label></div>
              </div>
              {newType==='likert' && (
                <div className="row">
                  <div className="card span-6"><div className="label">Likert anchors (EN)</div><input className="input" value={likertLabelsEn} onChange={e=> setLikertLabelsEn(e.target.value)} placeholder="Strongly disagree, …"/></div>
                  <div className="card span-6"><div className="label">Likert anchors (ZH)</div><input className="input" value={likertLabelsZh} onChange={e=> setLikertLabelsZh(e.target.value)} placeholder="非常不同意，…"/></div>
                  <div className="card span-12"><label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={likertShowNumbers} onChange={e=> setLikertShowNumbers(e.target.checked)} /> Show numbers with labels</label></div>
                </div>
              )}
              {(newType==='single' || newType==='multiple' || newType==='dropdown') && (
                <div className="row">
                  <div className="card span-6"><div className="label">{t('options_en')}</div><textarea className="input" rows={3} value={newOptsEn} onChange={e=> setNewOptsEn(e.target.value)} placeholder={'Option A\nOption B'} /></div>
                  <div className="card span-6"><div className="label">{t('options_zh')}</div><textarea className="input" rows={3} value={newOptsZh} onChange={e=> setNewOptsZh(e.target.value)} placeholder={'选项一\n选项二'} /></div>
                </div>
              )}
              {(newType==='rating' || newType==='numeric' || newType==='slider') && (
                <div className="row">
                  <div className="card span-4"><div className="label">Min</div><input className="input" type="number" value={newMin} onChange={e=> setNewMin(e.target.value)} /></div>
                  <div className="card span-4"><div className="label">Max</div><input className="input" type="number" value={newMax} onChange={e=> setNewMax(e.target.value)} /></div>
                  <div className="card span-4"><div className="label">Step</div><input className="input" type="number" value={newStep} onChange={e=> setNewStep(e.target.value)} /></div>
                </div>
              )}
              {(newType==='short_text' || newType==='long_text') && (
                <div className="row">
                  <div className="card span-6"><div className="label">Placeholder (EN)</div><input className="input" value={newPhEn} onChange={e=> setNewPhEn(e.target.value)} /></div>
                  <div className="card span-6"><div className="label">Placeholder (ZH)</div><input className="input" value={newPhZh} onChange={e=> setNewPhZh(e.target.value)} /></div>
                </div>
              )}
              <div className="cta-row" style={{marginTop:8}}>
                <button className="btn" onClick={()=> setNewOpen(false)}>{t('cancel')||'Cancel'}</button>
                <button className="btn btn-primary" onClick={addItem}>{t('create')}</button>
              </div>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="card span-8">
        <div className="muted">{t('select_item_to_edit')||'Select an item from the left to edit, or click “Add item”.'}</div>
      </div>
    )
  }

  function SettingsView() {
    if (!scale) return null
    return (
      <>
        <div className="row">
          <div className="card span-6">
            <h4 className="section-title" style={{marginTop:0}}>{t('basic_info')||'Basic Info'}</h4>
            <div className="item"><div className="label">{t('name_en')}</div><input className="input" value={scale.name_i18n?.en||''} onChange={e=> setScale((s:any)=> ({...s, name_i18n: {...(s.name_i18n||{}), en: e.target.value }}))} /></div>
            <div className="item"><div className="label">{t('name_zh')}</div><input className="input" value={scale.name_i18n?.zh||''} onChange={e=> setScale((s:any)=> ({...s, name_i18n: {...(s.name_i18n||{}), zh: e.target.value }}))} /></div>
            <div className="item"><div className="label">{t('points')}</div><input className="input" type="number" value={scale.points||5} onChange={e=> setScale((s:any)=> ({...s, points: Number(e.target.value||5) }))} /></div>
            <div className="cta-row" style={{marginTop:8}}>
              <button className="btn btn-primary" onClick={saveScale}>{t('save')}</button>
            </div>
          </div>
          <div className="card span-6">
            <h4 className="section-title" style={{marginTop:0}}>{t('security')||'Security'}</h4>
            <div className="item"><div className="label">{t('collect_email')}</div>
              <select className="select" value={scale.collect_email||'off'} onChange={e=> setScale((s:any)=> ({...s, collect_email: e.target.value }))}>
                <option value="off">{t('collect_email_off')||'Off'}</option>
                <option value="optional">{t('collect_email_optional')||'Optional'}</option>
                <option value="required">{t('collect_email_required')||'Required'}</option>
              </select>
            </div>
            <label className="item" style={{display:'flex',alignItems:'center',gap:8}}>
              <input className="checkbox" type="checkbox" checked={!!scale.e2ee_enabled} onChange={e=> setScale((s:any)=> ({...s, e2ee_enabled: e.target.checked }))} /> End‑to‑end encryption
            </label>
            <div className="item"><div className="label">{t('region')||'Region'}</div>
              <select className="select" value={scale.region||'auto'} onChange={e=> setScale((s:any)=> ({...s, region: e.target.value }))}>
                {['auto','gdpr','pipl','pdpa','ccpa'].map(r=> <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <label className="item" style={{display:'flex',alignItems:'center',gap:8}}>
              <input className="checkbox" type="checkbox" checked={!!turnstile} onChange={e=> setTurnstile(e.target.checked)} /> Turnstile (anti‑bot)
            </label>
            <div className="item"><div className="label">{t('items_per_page')||'Items per page'}</div><input className="input" type="number" value={itemsPerPage} onChange={e=> setItemsPerPage(e.target.value)} /></div>
            <div className="cta-row" style={{marginTop:8}}>
              <button className="btn btn-primary" onClick={saveScale}>{t('save')}</button>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="card span-12">
            <h4 className="section-title" style={{marginTop:0}}>{t('consent_settings')||'Consent Settings'}</h4>
            <div className="row">
              <div className="card span-3"><div className="label">Version</div><input className="input" value={consentVersion} onChange={e=> setConsentVersion(e.target.value)} /></div>
              <div className="card span-3"><div className="label">Signature</div><label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={signatureRequired} onChange={e=> setSignatureRequired(e.target.checked)} /> {t('consent.require_signature')||'Require signature'}</label></div>
            </div>
            <div className="tile" style={{padding:10, marginBottom:8}}>
              <div className="muted" style={{marginBottom:6}}>{t('consent.presets_title')||'Pick a preset (you can still tweak below):'}</div>
              <div className="cta-row">
                <button className="btn" onClick={()=> setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:false}])}>{t('consent.preset_min')||'Minimal'}</button>
                <button className="btn" onClick={()=> { setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:false}]); setSignatureRequired(true) }}>{t('consent.preset_rec')||'Recommended'}</button>
                <button className="btn" onClick={()=> { setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:true}]); setSignatureRequired(true) }}>{t('consent.preset_strict')||'Strict'}</button>
              </div>
            </div>
            <div className="tile" style={{padding:10}}>
              <div className="muted" style={{marginBottom:6}}>{t('consent.simple_title')||'Ask participants to confirm:'}</div>
              <label className="item" style={{display:'flex',alignItems:'center',gap:8}}>
                <input className="checkbox" type="checkbox" checked={!!getOpt('withdrawal')?.required} onChange={e=> setOptRequired('withdrawal', e.target.checked)} /> {t('survey.consent_opt.withdrawal')||'I understand I can withdraw at any time.'}
              </label>
              <label className="item" style={{display:'flex',alignItems:'center',gap:8}}>
                <input className="checkbox" type="checkbox" checked={!!getOpt('data_use')?.required} onChange={e=> setOptRequired('data_use', e.target.checked)} /> {t('survey.consent_opt.data_use')||'I understand my data is for academic/aggregate use only.'}
              </label>
              <label className="item" style={{display:'flex',alignItems:'center',gap:8}}>
                <input className="checkbox" type="checkbox" checked={!!getOpt('recording')?.required} onChange={e=> setOptRequired('recording', e.target.checked)} /> {t('survey.consent_opt.recording')||'I consent to audio/video recording where applicable.'}
              </label>
              <div className="cta-row" style={{marginTop:8}}>
                <button className="btn btn-primary" onClick={saveConsentConfig}>{t('save')}</button>
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="card span-6">
            <h4 className="section-title" style={{marginTop:0}}>AI {t('translate')||'Translate'}</h4>
            {!aiReady && <div className="muted">{t('ai_not_configured')||'AI translation is not configured. Set API key in Admin → AI.'}</div>}
            <div className="item"><div className="label">{t('target_languages')||'Target languages (comma separated)'}</div>
              <input className="input" value={aiTargets} onChange={e=> setAiTargets(e.target.value)} placeholder={'zh, en'} />
            </div>
            <div className="cta-row">
              <button className="btn" disabled={!aiReady || aiWorking} onClick={async()=>{
                setAiMsg(''); setAiPreview(null); setAiWorking(true)
                try {
                  const langs = aiTargets.split(/[,\s]+/).map(s=>s.trim()).filter(Boolean)
                  const res = await adminAITranslatePreview(id, langs)
                  setAiPreview(res)
                } catch(e:any){ setAiMsg(e.message||String(e)); toast.error(e.message||String(e)) } finally { setAiWorking(false) }
              }}>{aiWorking? (t('working')||'Working…') : (t('preview')||'Preview')}</button>
            </div>
            {aiPreview && (
              <div className="tile" style={{padding:10, marginTop:8}}>
                <div className="muted">{t('preview')} · {Object.keys(aiPreview.items||{}).length} {t('items')||'items'}</div>
              </div>
            )}
            {aiMsg && <div className="muted" style={{marginTop:6}}>{aiMsg}</div>}
          </div>
          <div className="card span-6">
            <ExportPanel/>
          </div>
        </div>
      </>
    )
  }

  function ShareView() {
    return (
      <>
        <div className="row">
          <div className="card span-6">
            <h4 className="section-title" style={{marginTop:0}}>{t('share')}</h4>
            <div className="item"><div className="label">URL</div><input className="input" value={shareLink(id)} readOnly /></div>
            <div className="cta-row"><button className="btn" onClick={()=>copyLink(id)}>{t('copy_link')||'Copy link'}</button></div>
          </div>
          <div className="card span-6">
            <h4 className="section-title" style={{marginTop:0}}>{t('analytics')||'Analytics'}</h4>
            {!analytics && <div className="muted">{t('no_data')||'No data yet.'}</div>}
            {analytics && (
              <div>
                <div className="item"><div className="label">N</div><div>{analytics.total_responses||0}</div></div>
                {analytics.items && analytics.items.length>0 && (
                  <div className="tile" style={{padding:8, marginTop:8}}>
                    <div className="muted" style={{marginBottom:6}}>{t('item_distributions')||'Item distributions'}</div>
                    <div style={{display:'grid', gridTemplateColumns: `240px repeat(${Math.min(10, (analytics.items?.[0]?.histogram?.length||5))}, 1fr)`, gap:6, alignItems:'center'}}>
                      <div></div>
                      {Array.from({length: Math.min(10, (analytics.items?.[0]?.histogram?.length||5))}, (_,i)=> i+1).map(i=> <div key={i} className="muted" style={{textAlign:'center'}}>{i}</div>)}
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
                )}
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="container">
      <div className="hero">
        <div className="glitch" data-text={t('manage')}>{t('manage')}</div>
        <div className="muted">{t('admin_edit_flow_hint')||'New streamlined editor: edit items on the left, details on the right.'}</div>
      </div>

      <div className="tabs-nav" style={{marginBottom:12}}>
        <button className="tab" onClick={()=> setActiveView('editor')} style={{borderColor: activeView==='editor'?'rgba(125,211,252,0.65)':''}}>{t('items_editor')||'Items Editor'}</button>
        <button className="tab" onClick={()=> setActiveView('settings')} style={{borderColor: activeView==='settings'?'rgba(125,211,252,0.65)':''}}>{t('settings')||'Settings'}</button>
        <button className="tab" onClick={()=> setActiveView('share')} style={{borderColor: activeView==='share'?'rgba(125,211,252,0.65)':''}}>{t('share')||'Share & Results'}</button>
      </div>

      {activeView==='editor' && (
        <div className="row">
          <ItemsList/>
          <ItemEditor/>
        </div>
      )}

      {activeView==='settings' && (
        <SettingsView/>
      )}

      {activeView==='share' && (
        <ShareView/>
      )}

      {msg && <div className="muted" style={{marginTop:12}}>{msg}</div>}
    </div>
  )
}

export default ScaleEditor

function ExportPanel() {
  const { t } = useTranslation()
  const { id='' } = useParams()
  const [consentHeader, setConsentHeader] = useState<'key'|'label_en'|'label_zh'>('key')
  // We cannot read scale.e2ee_enabled here reliably; provide links regardless and hint
  return (
    <>
      <h4 className="section-title" style={{marginTop:0}}>{t('export')||'Export'}</h4>
      <div className="item" style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:8}}>
        <div className="label">Consent column header</div>
        <select className="select" value={consentHeader} onChange={e=> setConsentHeader(e.target.value as any)}>
          <option value="key">key (consent.&lt;key&gt;)</option>
          <option value="label_en">label_en</option>
          <option value="label_zh">label_zh</option>
        </select>
        <span className="muted">CSV is UTF‑8 with BOM (Excel‑friendly)</span>
      </div>
      <div className="cta-row">
        <a className="neon-btn" href={`/api/export?format=long&scale_id=${encodeURIComponent(id)}&consent_header=${encodeURIComponent(consentHeader)}`} target="_blank" rel="noreferrer">{t('export_long_csv')||'Export long CSV'}</a>
        <a className="neon-btn" href={`/api/export?format=wide&scale_id=${encodeURIComponent(id)}&consent_header=${encodeURIComponent(consentHeader)}`} target="_blank" rel="noreferrer">{t('export_wide_csv')||'Export wide CSV'}</a>
        <a className="neon-btn" href={`/api/export?format=score&scale_id=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">{t('export_score_csv')||'Export score CSV'}</a>
      </div>
      <div className="muted" style={{marginTop:6}}>{t('e2ee.csv_disabled')||'CSV disabled (end‑to‑end encryption)'}</div>
    </>
  )
}
