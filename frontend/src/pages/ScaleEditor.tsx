import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
  adminCreateE2EEExport,
  adminPurgeResponses,
} from '../api/client'
import { decryptSingleWithX25519 } from '../crypto/e2ee'

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
  const [aiInclude, setAiInclude] = useState<Record<string, boolean>>({})
  const [aiApplying, setAiApplying] = useState(false)

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
      toast.success(t('save_success'))
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
  function setOptMode(key: string, mode: 'off'|'optional'|'required') {
    setConsentOptions(list => {
      if (mode === 'off') {
        return list.filter(o => o.key !== key)
      }
      const idx = list.findIndex(o=> o.key===key)
      if (idx === -1) {
        return [...list, { key, required: mode === 'required' }]
      }
      const next = [...list]
      next[idx] = { ...next[idx], required: mode === 'required' }
      return next
    })
  }
  async function saveConsentConfig() {
    try {
      const keys = consentOptions.map(o=> o.key.trim())
      const hasEmpty = keys.some(k=> !k)
      const dup = keys.find((k, i)=> k && keys.indexOf(k) !== i)
      if (hasEmpty || dup) {
        toast.error(t('consent.advanced.save_first_error'))
        return
      }
      const options = consentOptions.map(o=> ({ key:o.key.trim(), required: !!o.required, label_i18n: { en: o.en || undefined, zh: o.zh || undefined } }))
      const consentText = {
        en: scale?.consent_i18n?.en?.trim() ? scale.consent_i18n.en : undefined,
        zh: scale?.consent_i18n?.zh?.trim() ? scale.consent_i18n.zh : undefined,
      }
      await adminUpdateScale(id, {
        consent_i18n: consentText,
        consent_config: { version: consentVersion||'v1', options, signature_required: !!signatureRequired }
      } as any)
      toast.success(t('save_success'))
    } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }

  const [advancedConsentOpen, setAdvancedConsentOpen] = useState(false)

  function AdvancedConsent({ open }: { open: boolean }) {
    if (!scale) return null
    const moveRow = (idx: number, delta: number) => {
      if (!delta) return
      setConsentOptions(list => {
        const next = [...list]
        const target = idx + delta
        if (target < 0 || target >= next.length) return next
        const tmp = next[idx]
        next[idx] = next[target]
        next[target] = tmp
        return next
      })
    }
    const removeRow = (idx: number) => setConsentOptions(list => list.filter((_, i) => i !== idx))
    return (
      <>
        <button type="button" className="btn btn-ghost" onClick={()=> setAdvancedConsentOpen(o=> !o)}>{open? t('consent.hide_advanced') : t('consent.show_advanced')}</button>
        {open && (
          <div className="tile" style={{padding:16, marginTop:8}}>
            <div className="row">
              <div className="card span-6">
                <div className="label">{t('consent_en')}</div>
                <textarea className="input" rows={4} value={scale.consent_i18n?.en||''} onChange={e=> setScale((prev:any)=> ({...prev, consent_i18n: {...(prev?.consent_i18n||{}), en: e.target.value }}))} placeholder={t('consent_hint') as string} />
              </div>
              <div className="card span-6">
                <div className="label">{t('consent_zh')}</div>
                <textarea className="input" rows={4} value={scale.consent_i18n?.zh||''} onChange={e=> setScale((prev:any)=> ({...prev, consent_i18n: {...(prev?.consent_i18n||{}), zh: e.target.value }}))} placeholder={t('consent_hint') as string} />
              </div>
            </div>
            <div className="muted" style={{marginBottom:12}}>{t('consent_md_hint')}</div>
            <table className="consent-table">
              <thead>
                <tr>
                  <th>{t('consent.advanced.key')}</th>
                  <th>{t('consent.advanced.label_en')}</th>
                  <th>{t('consent.advanced.label_zh')}</th>
                  <th>{t('consent.advanced.required')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {consentOptions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">{t('consent.advanced.empty')}</td>
                  </tr>
                )}
                {consentOptions.map((o, idx) => (
                  <tr key={idx}>
                    <td data-label={t('consent.advanced.key')}><input className="input" value={o.key} onChange={e=> setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, key: e.target.value}:x))} /></td>
                    <td data-label={t('consent.advanced.label_en')}><input className="input" value={o.en||''} onChange={e=> setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, en: e.target.value}:x))} placeholder={t('optional')} /></td>
                    <td data-label={t('consent.advanced.label_zh')}><input className="input" value={o.zh||''} onChange={e=> setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, zh: e.target.value}:x))} placeholder={t('optional')} /></td>
                    <td data-label={t('consent.advanced.required')}><label style={{display:'inline-flex',alignItems:'center',gap:6}}><input className="checkbox" type="checkbox" checked={o.required} onChange={e=> setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, required: e.target.checked}:x))} />{t('required')}</label></td>
                    <td data-label={t('actions')}>
                      <div className="consent-table-actions">
                        <button type="button" className="btn btn-ghost" onClick={()=> removeRow(idx)}>{t('delete')}</button>
                        <button type="button" className="btn btn-ghost" disabled={idx===0} onClick={()=> moveRow(idx, -1)}>↑</button>
                        <button type="button" className="btn btn-ghost" disabled={idx===consentOptions.length-1} onClick={()=> moveRow(idx, 1)}>↓</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="cta-row" style={{marginTop:12, justifyContent:'flex-end'}}>
              <button className="btn" type="button" onClick={()=> setConsentOptions(list=> [...list, { key:'custom_'+(list.length+1), required:false }])}>{t('consent.advanced.add_option')}</button>
              <button className="btn btn-primary" type="button" onClick={saveConsentConfig}>{t('save')}</button>
            </div>
          </div>
        )}
      </>
    )
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
      toast.success(t('save_success'))
      setItems(arr=> arr.map(x=> x.id===it.id? { ...x, ...upd }: x))
    } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }
  async function removeItem(itemId:string) {
    if (!confirm(t('confirm_delete_item'))) return
    try { await adminDeleteItem(itemId); setItems(items.filter(x=>x.id!==itemId)); toast.success(t('delete_success')); if (selectedItemId===itemId) setSelectedItemId(null) } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
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
      toast.success(t('create_success'))
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
        toast.success(t('copied'))
      } else { setMsg(url) }
    } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }

  // UI chunks
  function ItemsList() {
    return (
      <div className="card span-4">
          <div className="cta-row" style={{justifyContent:'space-between'}}>
          <div className="section-title">{t('your_items')}</div>
          <div className="cta-row">
            <button type="button" className="btn" onClick={async()=>{ try { await adminReorderItems(id, items.map((x:any)=> x.id)); toast.success(t('save_success')) } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) } }}>{t('editor.save_order')}</button>
            <button type="button" className="btn btn-primary" onClick={()=> { setNewOpen(true); setSelectedItemId(null) }}>{t('add_item')}</button>
          </div>
        </div>
        {items.length===0 && <div className="muted">{t('no_items')}</div>}
        <div style={{marginTop:8}}>
          {items.map((it:any, idx:number)=> (
            <div key={it.id} className="tile" style={{padding:10, marginTop:8, border: selectedItemId===it.id? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius:12}}>
              <div className="cta-row" style={{justifyContent:'space-between'}}>
                <button type="button" className="btn btn-ghost" onClick={()=> setSelectedItemId(it.id)} style={{flex:1, justifyContent:'flex-start'}}>
                  <div style={{textAlign:'left'}}>
                    <div className="muted" style={{fontSize:12}}>{it.type||'likert'}</div>
                    <div style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{it.stem_i18n?.[i18n.language as 'en'|'zh'] || it.stem_i18n?.en || it.stem_i18n?.zh || it.id}</div>
                  </div>
                </button>
                <div className="cta-row">
                  <button type="button" className="btn btn-ghost" onClick={()=> setItems(arr=> { const a=[...arr]; if (idx<=0) return a; const t=a[idx]; a[idx]=a[idx-1]; a[idx-1]=t; return a })} disabled={idx===0}>↑</button>
                  <button type="button" className="btn btn-ghost" onClick={()=> setItems(arr=> { const a=[...arr]; if (idx>=arr.length-1) return a; const t=a[idx]; a[idx]=a[idx+1]; a[idx+1]=t; return a })} disabled={idx===items.length-1}>↓</button>
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
          <div className="item-editor-grid">
            <div className="item span-12"><h4 style={{margin:0}}>{t('editor.edit_item')}</h4></div>
            <div className="item span-12 muted">{t('label.id')}: <b>{it.id}</b></div>
            <div className="item span-6"><div className="label">{t('stem_en')}</div><input className="input" value={it.stem_i18n?.en||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, stem_i18n: {...(x.stem_i18n||{}), en: e.target.value }}:x))} /></div>
            <div className="item span-6"><div className="label">{t('stem_zh')}</div><input className="input" value={it.stem_i18n?.zh||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, stem_i18n: {...(x.stem_i18n||{}), zh: e.target.value }}:x))} /></div>
            <div className="item span-12 muted">{t('label.type')}: <b>{it.type||'likert'}</b></div>
            {(it.type===undefined || it.type==='likert') && (
              <>
                <div className="item span-12 tile-ghost">
                  <div className="group-grid">
                    <div className="group-item span-4" style={{display:'flex',alignItems:'center',gap:8}}><label><input className="checkbox" type="checkbox" checked={!!it.required} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, required: e.target.checked }:x))} /> {t('required')}</label></div>
                    <div className="group-item span-4" style={{display:'flex',alignItems:'center',gap:8}}><label><input className="checkbox" type="checkbox" checked={!!it.reverse_scored} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, reverse_scored: e.target.checked }:x))} /> {t('reverse_scored')}</label></div>
                    <div className="group-item span-4"></div>
                  </div>
                </div>
                <div className="item span-12 tile-ghost">
                  <div className="group-grid">
                    <div className="group-item span-12">
                      <div className="label">{t('label.likert_anchors_item')}</div>
                      <div className="muted" style={{marginBottom:6}}>{t('likert.presets.title')}</div>
                      <select className="select" value="" onChange={e=> {
                        const key = e.target.value
                        if (!key) {
                          setItems(arr=> arr.map(x=> x.id===it.id? {...x, likert_labels_i18n: { en: [], zh: [] }}:x))
                          return
                        }
                        const preset = LIKERT_PRESETS[key]
                        if (!preset) return
                        setItems(arr=> arr.map(x=> x.id===it.id? {
                          ...x,
                          likert_labels_i18n: {
                            en: [...preset.en],
                            zh: [...preset.zh],
                          },
                        }:x))
                      }}>
                        <option value="">{t('likert.presets.custom')}</option>
                        {Object.keys(LIKERT_PRESETS).map(key=> (
                          <option key={key} value={key}>{t(`likert.presets.${key}`)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="group-item span-6"><div className="label">{t('lang_en')}</div><input className="input" value={((it as any).likert_labels_i18n?.en && (it as any).likert_labels_i18n.en.length>0) ? (it as any).likert_labels_i18n.en.join(', ') : likertLabelsEn} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, likert_labels_i18n: {...(((x as any).likert_labels_i18n)||{}), en: e.target.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder={t('hint.likert_anchors_en')} /></div>
                    <div className="group-item span-6"><div className="label">{t('lang_zh')}</div><input className="input" value={((it as any).likert_labels_i18n?.zh && (it as any).likert_labels_i18n.zh.length>0) ? (it as any).likert_labels_i18n.zh.join('，') : likertLabelsZh} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, likert_labels_i18n: {...(((x as any).likert_labels_i18n)||{}), zh: e.target.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder={t('hint.likert_anchors_zh')} /></div>
                    <div className="group-item span-12" style={{display:'flex',alignItems:'center',gap:8}}><label><input className="checkbox" type="checkbox" checked={!!(it as any).likert_show_numbers} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, likert_show_numbers: e.target.checked }:x))} /> {t('likert.show_numbers')}</label></div>
                  </div>
                </div>
              </>
            )}
            {(it.type==='single' || it.type==='multiple' || it.type==='dropdown') && (
              <>
                <div className="item span-12 tile-ghost">
                  <div className="group-grid">
                    <div className="group-item span-6"><div className="label">{t('label.options_en')}</div><textarea className="input" rows={3} value={(it as any).options_i18n?.en?.join('\n')||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, options_i18n: {...(((x as any).options_i18n)||{}), en: e.target.value.split(/\n/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder={t('hint.options_en_placeholder') as string} /></div>
                    <div className="group-item span-6"><div className="label">{t('label.options_zh')}</div><textarea className="input" rows={3} value={(it as any).options_i18n?.zh?.join('\n')||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, options_i18n: {...(((x as any).options_i18n)||{}), zh: e.target.value.split(/\n/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder={t('hint.options_zh_placeholder') as string} /></div>
                  </div>
                </div>
              </>
            )}
            {(it.type==='rating' || it.type==='numeric' || it.type==='slider') && (
              <div className="item span-12 tile-ghost">
                <div className="group-grid">
                  <div className="group-item span-4"><div className="label">{t('label.min')}</div><input className="input" type="number" value={(it.min??'') as any} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, min: e.target.value===''? undefined : Number(e.target.value) }:x))} /></div>
                  <div className="group-item span-4"><div className="label">{t('label.max')}</div><input className="input" type="number" value={(it.max??'') as any} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, max: e.target.value===''? undefined : Number(e.target.value) }:x))} /></div>
                  <div className="group-item span-4"><div className="label">{t('label.step')}</div><input className="input" type="number" value={(it.step??'') as any} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, step: e.target.value===''? undefined : Number(e.target.value) }:x))} /></div>
                </div>
              </div>
            )}
            {(it.type==='short_text' || it.type==='long_text') && (
              <div className="item span-12 tile-ghost">
                <div className="group-grid">
                  <div className="group-item span-6"><div className="label">{t('label.placeholder_en')}</div><input className="input" value={(it as any).placeholder_i18n?.en||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, placeholder_i18n: {...(((x as any).placeholder_i18n)||{}), en: e.target.value }}:x))} /></div>
                  <div className="group-item span-6"><div className="label">{t('label.placeholder_zh')}</div><input className="input" value={(it as any).placeholder_i18n?.zh||''} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, placeholder_i18n: {...(((x as any).placeholder_i18n)||{}), zh: e.target.value }}:x))} /></div>
                </div>
              </div>
            )}
            <div className="item span-12" style={{display:'flex', justifyContent:'flex-end', gap:12}}>
              <button type="button" className="btn btn-ghost" onClick={()=> removeItem(it.id)}>{t('delete')}</button>
              <button type="button" className="btn btn-primary" onClick={()=> saveItem(it)}>{t('save')}</button>
            </div>
          </div>
        </div>
      )
    }
    if (newOpen) {
      return (
        <div className="card span-8">
          <div className="item-editor-grid">
            <div className="item span-12"><h4 style={{margin:0}}>{t('add_item')}</h4></div>
            <div className="item span-6"><div className="label">{t('stem_en')}</div><input className="input" value={newStemEn} onChange={e=> setNewStemEn(e.target.value)} /></div>
            <div className="item span-6"><div className="label">{t('stem_zh')}</div><input className="input" value={newStemZh} onChange={e=> setNewStemZh(e.target.value)} /></div>
            <div className="item span-4"><div className="label">{t('label.type')}</div>
              <select className="select" value={newType} onChange={e=> setNewType(e.target.value as any)}>
                {['likert','single','multiple','dropdown','rating','short_text','long_text','numeric','date','time','slider'].map(x=> <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="item span-4"><div className="label">{t('required')}</div><label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={newRequired} onChange={e=> setNewRequired(e.target.checked)} /> required</label></div>
            <div className="item span-4"><div className="label">{t('reverse_scored')}</div><label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={newReverse} onChange={e=> setNewReverse(e.target.checked)} /> reverse</label></div>
            {newType==='likert' && (
              <>
                <div className="item span-12">
                  <div className="label">{t('likert.presets.title')}</div>
                  <select className="select" value="" onChange={e=> {
                    const key = e.target.value
                    if (!key) {
                      setLikertLabelsEn('')
                      setLikertLabelsZh('')
                      return
                    }
                    const preset = LIKERT_PRESETS[key]
                    if (!preset) return
                    setLikertLabelsEn(preset.en.join(', '))
                    setLikertLabelsZh(preset.zh.join('，'))
                  }}>
                    <option value="">{t('likert.presets.custom')}</option>
                    {Object.keys(LIKERT_PRESETS).map(key=> (
                      <option key={key} value={key}>{t(`likert.presets.${key}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="item span-6"><div className="label">{t('label.likert_anchors_item')} (EN)</div><input className="input" value={likertLabelsEn} onChange={e=> setLikertLabelsEn(e.target.value)} placeholder={t('hint.likert_anchors_en')}/></div>
                <div className="item span-6"><div className="label">{t('label.likert_anchors_item')} (ZH)</div><input className="input" value={likertLabelsZh} onChange={e=> setLikertLabelsZh(e.target.value)} placeholder={t('hint.likert_anchors_zh')}/></div>
                <div className="item span-12"><label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={likertShowNumbers} onChange={e=> setLikertShowNumbers(e.target.checked)} /> {t('likert.show_numbers')}</label></div>
              </>
            )}
            {(newType==='single' || newType==='multiple' || newType==='dropdown') && (
              <div className="item span-12 tile-ghost">
                <div className="group-grid">
                  <div className="group-item span-6"><div className="label">{t('label.options_en')}</div><textarea className="input" rows={3} value={newOptsEn} onChange={e=> setNewOptsEn(e.target.value)} placeholder={t('hint.options_en_placeholder') as string} /></div>
                  <div className="group-item span-6"><div className="label">{t('label.options_zh')}</div><textarea className="input" rows={3} value={newOptsZh} onChange={e=> setNewOptsZh(e.target.value)} placeholder={t('hint.options_zh_placeholder') as string} /></div>
                </div>
              </div>
            )}
            {(newType==='rating' || newType==='numeric' || newType==='slider') && (
              <div className="item span-12 tile-ghost">
                <div className="group-grid">
                  <div className="group-item span-4"><div className="label">{t('label.min')}</div><input className="input" type="number" value={newMin} onChange={e=> setNewMin(e.target.value)} /></div>
                  <div className="group-item span-4"><div className="label">{t('label.max')}</div><input className="input" type="number" value={newMax} onChange={e=> setNewMax(e.target.value)} /></div>
                  <div className="group-item span-4"><div className="label">{t('label.step')}</div><input className="input" type="number" value={newStep} onChange={e=> setNewStep(e.target.value)} /></div>
                </div>
              </div>
            )}
            {(newType==='short_text' || newType==='long_text') && (
              <div className="item span-12 tile-ghost">
                <div className="group-grid">
                  <div className="group-item span-6"><div className="label">{t('label.placeholder_en')}</div><input className="input" value={newPhEn} onChange={e=> setNewPhEn(e.target.value)} /></div>
                  <div className="group-item span-6"><div className="label">{t('label.placeholder_zh')}</div><input className="input" value={newPhZh} onChange={e=> setNewPhZh(e.target.value)} /></div>
                </div>
              </div>
            )}
            <div className="item span-12" style={{display:'flex', justifyContent:'flex-end', gap:12}}>
              <button type="button" className="btn" onClick={()=> setNewOpen(false)}>{t('cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={addItem}>{t('create')}</button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="card span-8">
        <div style={{minHeight:200, display:'grid', placeItems:'center', padding:24}}>
          <div className="muted" style={{textAlign:'center'}}>{t('editor.select_item_to_edit')}</div>
        </div>
      </div>
    )
  }

  function SettingsView() {
    if (!scale) return null
    return (
      <>
        <div className="row">
          <div className="card span-6">
            <h4 className="section-title" style={{marginTop:0}}>{t('editor.basic_info')}</h4>
            <div className="item"><div className="label">{t('name_en')}</div><input className="input" value={scale.name_i18n?.en||''} onChange={e=> setScale((s:any)=> ({...s, name_i18n: {...(s.name_i18n||{}), en: e.target.value }}))} /></div>
            <div className="item"><div className="label">{t('name_zh')}</div><input className="input" value={scale.name_i18n?.zh||''} onChange={e=> setScale((s:any)=> ({...s, name_i18n: {...(s.name_i18n||{}), zh: e.target.value }}))} /></div>
            <div className="item"><div className="label">{t('points')}</div><input className="input" type="number" value={scale.points||5} onChange={e=> setScale((s:any)=> ({...s, points: Number(e.target.value||5) }))} /></div>
            <div className="item">
              <div className="label">{t('likert.defaults')}</div>
              <div className="muted" style={{marginBottom:6}}>{t('likert.presets.title')}</div>
              <select className="select" value={likertPreset} onChange={e=> {
                const value = e.target.value
                setLikertPreset(value)
                if (!value) return
                const preset = LIKERT_PRESETS[value]
                if (!preset) return
                setLikertLabelsEn(preset.en.join(', '))
                setLikertLabelsZh(preset.zh.join('，'))
              }}>
                <option value="">{t('likert.presets.custom')}</option>
                {Object.keys(LIKERT_PRESETS).map(key => (
                  <option key={key} value={key}>{t(`likert.presets.${key}`)}</option>
                ))}
              </select>
              <div className="row" style={{marginTop:8}}>
                <div className="card span-6"><div className="label">{t('lang_en')}</div><input className="input" value={likertLabelsEn} onChange={e=> setLikertLabelsEn(e.target.value)} placeholder={t('hint.likert_anchors_en')} /></div>
                <div className="card span-6"><div className="label">{t('lang_zh')}</div><input className="input" value={likertLabelsZh} onChange={e=> setLikertLabelsZh(e.target.value)} placeholder={t('hint.likert_anchors_zh')} /></div>
              </div>
              <label className="item" style={{display:'inline-flex',alignItems:'center',gap:8, marginTop:6}}>
                <input className="checkbox" type="checkbox" checked={likertShowNumbers} onChange={e=> setLikertShowNumbers(e.target.checked)} /> {t('likert.show_numbers')}
              </label>
              <div className="muted" style={{marginTop:6}}>{t('likert.apply_hint')}</div>
            </div>
            <div className="cta-row" style={{marginTop:8}}>
              <button type="button" className="btn btn-primary" onClick={saveScale}>{t('save')}</button>
            </div>
          </div>
          <div className="card span-6">
            <h4 className="section-title" style={{marginTop:0}}>{t('editor.security')}</h4>
            <div className="item"><div className="label">{t('collect_email')}</div>
              <select className="select" value={scale.collect_email||'off'} onChange={e=> setScale((s:any)=> ({...s, collect_email: e.target.value }))}>
                <option value="off">{t('collect_email_off')}</option>
                <option value="optional">{t('collect_email_optional')}</option>
                <option value="required">{t('collect_email_required')}</option>
              </select>
            </div>
            <label className="item" style={{display:'flex',alignItems:'center',gap:8}}>
              <input className="checkbox" type="checkbox" checked={!!scale.e2ee_enabled} onChange={e=> setScale((s:any)=> ({...s, e2ee_enabled: e.target.checked }))} /> {t('e2ee.title')}
            </label>
            <div className="item"><div className="label">{t('region')}</div>
              <select className="select" value={scale.region||'auto'} onChange={e=> setScale((s:any)=> ({...s, region: e.target.value }))}>
                {['auto','gdpr','pipl','pdpa','ccpa'].map(r=> <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <label className="item" style={{display:'flex',alignItems:'center',gap:8}}>
              <input className="checkbox" type="checkbox" checked={!!turnstile} onChange={e=> setTurnstile(e.target.checked)} /> {t('turnstile.enable_label')}
            </label>
            <div className="item"><div className="label">{t('editor.items_per_page')}</div><input className="input" type="number" value={itemsPerPage} onChange={e=> setItemsPerPage(e.target.value)} /></div>
            <div className="cta-row" style={{marginTop:8}}>
              <button type="button" className="btn btn-primary" onClick={saveScale}>{t('save')}</button>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="card span-12">
            <h4 className="section-title" style={{marginTop:0}}>{t('consent_settings')}</h4>
            <div className="row">
              <div className="card span-3"><div className="label">{t('label.version')}</div><input className="input" value={consentVersion} onChange={e=> setConsentVersion(e.target.value)} /></div>
              <div className="card span-3"><div className="label">{t('label.signature')}</div><label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={signatureRequired} onChange={e=> setSignatureRequired(e.target.checked)} /> {t('consent.require_signature')}</label></div>
            </div>
            <div className="tile" style={{padding:10, marginBottom:8}}>
              <div className="muted" style={{marginBottom:6}}>{t('consent.presets_title')}</div>
              <div className="cta-row">
                <button type="button" className="btn" onClick={()=> setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:false}])}>{t('consent.preset_min')}</button>
                <button type="button" className="btn" onClick={()=> { setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:false}]); setSignatureRequired(true) }}>{t('consent.preset_rec')}</button>
                <button type="button" className="btn" onClick={()=> { setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:true}]); setSignatureRequired(true) }}>{t('consent.preset_strict')}</button>
              </div>
            </div>
            <div className="tile" style={{padding:10}}>
              <div className="muted" style={{marginBottom:6}}>{t('consent.simple_title')}</div>
              {[{key:'withdrawal', label: t('survey.consent_opt.withdrawal')},
                {key:'data_use', label: t('survey.consent_opt.data_use')},
                {key:'recording', label: t('survey.consent_opt.recording')}
              ].map(row => {
                const current = getOpt(row.key)
                const mode: 'off'|'optional'|'required' = !current ? 'off' : (current.required ? 'required' : 'optional')
                    const mkBtn = (value:'off'|'optional'|'required', text:string) => (
                  <button
                    key={value}
                    type="button"
                    className={`btn ${mode===value ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={()=> setOptMode(row.key, value)}
                  >{text}</button>
                )
                return (
                  <div key={row.key} className="item" style={{display:'grid', gap:6}}>
                    <div className="label">{row.label}</div>
                    <div className="cta-row" style={{gap:8}}>
                      {mkBtn('off', t('collect_email_off') as string)}
                      {mkBtn('optional', t('collect_email_optional') as string)}
                      {mkBtn('required', t('collect_email_required') as string)}
                    </div>
                  </div>
                )
              })}
              <div className="cta-row" style={{marginTop:8}}>
                <button type="button" className="btn btn-primary" onClick={saveConsentConfig}>{t('save')}</button>
                <AdvancedConsent open={advancedConsentOpen}/>
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="card span-6">
            <h4 className="section-title" style={{marginTop:0}}>{t('ai.title')}</h4>
            <div className="muted" style={{marginBottom:8}}>{t('ai.steps')}</div>
            <div className="item"><div className="label">{t('ai.targets')}</div>
              <input className="input" value={aiTargets} onChange={e=> setAiTargets(e.target.value)} placeholder={'zh, en'} />
            </div>
            <div className="cta-row" style={{flexWrap:'wrap', gap:8}}>
              <button className="btn btn-ghost" type="button" onClick={()=> setAiTargets('zh')}>EN→ZH</button>
              <button className="btn btn-ghost" type="button" onClick={()=> setAiTargets('en')}>ZH→EN</button>
              <button className="btn btn-ghost" type="button" onClick={()=> setAiTargets('zh,en,fr,de')}>+Common</button>
              <a className="btn btn-ghost" href="/admin/ai" target="_blank" rel="noreferrer">{t('ai.provider')}</a>
              <button type="button" className="btn" disabled={!aiReady || aiWorking} onClick={async()=>{
                setAiMsg(''); setAiPreview(null); setAiWorking(true)
                try {
                  const langs = aiTargets.split(/[,\s]+/).map(s=>s.trim()).filter(Boolean)
                  const res = await adminAITranslatePreview(id, langs)
                  setAiPreview(res)
                  const defaults: Record<string, boolean> = {}
                  for (const it of items) defaults[it.id] = true
                  setAiInclude(defaults)
                } catch(e:any){ setAiMsg(e.message||String(e)); toast.error(e.message||String(e)) } finally { setAiWorking(false) }
              }}>{aiWorking? t('working') : t('preview')}</button>
            </div>
            {!aiReady && (
              <div className="tile" style={{padding:10, border:'1px solid rgba(255,191,71,0.45)', background:'rgba(255,240,200,0.15)', color:'var(--muted)', marginTop:8, display:'grid', gap:8}}>
                <div>{t('ai.not_ready')}</div>
                <div className="cta-row" style={{justifyContent:'flex-start'}}>
                  <Link className="btn btn-ghost" to="/admin/ai">{t('ai.not_ready_link')}</Link>
                </div>
              </div>
            )}
            {aiPreview && (
              <div className="tile" style={{padding:10, marginTop:8}}>
                <div className="muted" style={{marginBottom:8}}>{t('ai.review')}</div>
                {items.map(it => {
                  const previewForItem = (aiPreview.items||{})[it.id] || {}
                  if (!previewForItem || Object.keys(previewForItem).length===0) return null
                  return (
                    <div key={it.id} style={{borderTop:'1px solid var(--border)', paddingTop:12, marginTop:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
                        <label style={{display:'inline-flex',alignItems:'center',gap:6}}>
                          <input className="checkbox" type="checkbox" checked={!!aiInclude[it.id]} onChange={e=> setAiInclude(prev=> ({...prev, [it.id]: e.target.checked}))} />
                          <span>{t('ai.include_label')}</span>
                        </label>
                        <div><b>{it.id}</b> · {it.stem_i18n?.en || it.stem || it.id}</div>
                      </div>
                      <div className="row" style={{marginTop:8}}>
                        {Object.entries(previewForItem).map(([lang, value]) => (
                          <div key={lang} className="card span-6" style={{minWidth:260}}>
                            <div className="label">{lang}</div>
                            <textarea className="input" rows={3} defaultValue={value as string} onChange={e=> {
                              const next = e.target.value
                              setAiPreview((prev: any) => ({
                                ...prev,
                                items: {
                                  ...(prev?.items || {}),
                                  [it.id]: { ...(prev?.items?.[it.id] || {}), [lang]: next }
                                }
                              }))
                            }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                <div className="cta-row" style={{marginTop:12}}>
                  <button type="button" className="btn btn-primary" disabled={aiApplying} onClick={async()=>{
                    setAiApplying(true)
                    try {
                      for (const it of items) {
                        if (!aiInclude[it.id]) continue
                        const additions = (aiPreview.items||{})[it.id] || {}
                        if (Object.keys(additions).length === 0) continue
                        await adminUpdateItem(it.id, { stem_i18n: { ...(it.stem_i18n||{}), ...(additions as any) } })
                      }
                      const scaleUpdates:any = {}
                      if (aiPreview.name_i18n) scaleUpdates.name_i18n = { ...(scale.name_i18n||{}), ...aiPreview.name_i18n }
                      if (aiPreview.consent_i18n) scaleUpdates.consent_i18n = { ...(scale.consent_i18n||{}), ...aiPreview.consent_i18n }
                      if (Object.keys(scaleUpdates).length > 0) {
                        await adminUpdateScale(id, scaleUpdates)
                      }
                      toast.success(t('save_success'))
                      setAiPreview(null)
                      load()
                    } catch(e:any) {
                      setAiMsg(e.message||String(e))
                      toast.error(e.message||String(e))
                    } finally {
                      setAiApplying(false)
                    }
                  }}>{aiApplying ? t('working') : t('apply')}</button>
                  <button type="button" className="btn btn-ghost" onClick={()=> setAiPreview(null)}>{t('cancel')}</button>
                </div>
              </div>
            )}
            {aiMsg && <div className="muted" style={{marginTop:6}}>{aiMsg}</div>}
          </div>
          <div className="card span-6">
            <ExportPanel scale={scale} items={items}/>
          </div>
        </div>
        <DangerZone scaleId={scale.id} />
      </>
    )
  }

  function ShareView({ scale }: { scale: any }) {
    return (
      <>
        <div className="row">
          <div className="card span-6">
            <h4 className="section-title" style={{marginTop:0}}>{t('share')}</h4>
            <div className="item"><div className="label">{t('label.url')}</div><input className="input" value={shareLink(id)} readOnly /></div>
            <div className="cta-row"><button type="button" className="btn" onClick={()=>copyLink(id)}>{t('editor.copy_link')}</button></div>
          </div>
          <div className="card span-6">
            <h4 className="section-title" style={{marginTop:0}}>{t('analytics')}</h4>
            {!analytics && <div className="muted">{t('editor.no_data')}</div>}
            {analytics && (
              <div>
                <div className="item stat-row"><div className="label">{t('label.n')}</div><div>{analytics.total_responses||0}</div></div>
                {scale?.e2ee_enabled ? (
                  <div className="tile" style={{padding:8, marginTop:8}}>
                    <div className="muted">{t('e2ee.analytics_notice')}</div>
                  </div>
                ) : (
                  analytics.items && analytics.items.length>0 && (
                    <div className="tile" style={{padding:8, marginTop:8}}>
                      <div className="muted" style={{marginBottom:6}}>{t('editor.item_distributions')}</div>
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
                  )
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
        <div className="muted">{t('editor.flow_hint')}</div>
      </div>

      <div className="cta-row" style={{justifyContent:'flex-end', marginBottom:12}}>
        <Link className="btn btn-ghost" to={`/admin/scale/${encodeURIComponent(id)}/legacy`}>{t('editor.legacy_view')}</Link>
      </div>

      <div className="tabs-nav" style={{marginBottom:12}}>
        <button className="tab" onClick={()=> setActiveView('editor')} style={{borderColor: activeView==='editor'?'rgba(125,211,252,0.65)':''}}>{t('editor.items_tab')}</button>
        <button className="tab" onClick={()=> setActiveView('settings')} style={{borderColor: activeView==='settings'?'rgba(125,211,252,0.65)':''}}>{t('editor.settings_tab')}</button>
        <button className="tab" onClick={()=> setActiveView('share')} style={{borderColor: activeView==='share'?'rgba(125,211,252,0.65)':''}}>{t('editor.share_tab')}</button>
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
        <ShareView scale={scale}/>
      )}

      {msg && <div className="muted" style={{marginTop:12}}>{msg}</div>}
    </div>
  )
}

export default ScaleEditor

function ExportPanel({ scale, items }: { scale: any; items: any[] }) {
  const { t } = useTranslation()
  const { id='' } = useParams()
  const isE2EE = !!scale?.e2ee_enabled
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [consentHeader, setConsentHeader] = useState<'key'|'label_en'|'label_zh'>('key')
  const [pkPass, setPkPass] = useState('')
  const [status, setStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement|null>(null)

  function fromB64(s: string) {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  function csvEsc(v: any): string {
    const s = v === null || v === undefined ? '' : (Array.isArray(v) ? v.join(', ') : (typeof v === 'object' ? JSON.stringify(v) : String(v)))
    return '"' + s.replace(/"/g, '""') + '"'
  }
  async function unlockLocalPriv(): Promise<Uint8Array> {
    const blobStr = localStorage.getItem('synap_pmk')
    if (!blobStr) throw new Error(t('e2ee.import_required'))
    if (!pkPass) throw new Error(t('e2ee.passphrase_needed'))
    const blob = JSON.parse(blobStr)
    const salt = fromB64(blob.salt)
    const iv = fromB64(blob.iv)
    const enc = fromB64(blob.enc_priv)
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pkPass), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt: salt.buffer, iterations: 120000, hash: 'SHA-256' }, keyMaterial, { name:'AES-GCM', length:256 }, false, ['decrypt'])
    const privAb = await crypto.subtle.decrypt({ name:'AES-GCM', iv: iv.buffer }, key, enc.buffer)
    return new Uint8Array(privAb)
  }
  async function decryptCurrentBundle(): Promise<{ out:any[]; enMap: Record<string,string>; zhMap: Record<string,string> }> {
    const priv = await unlockLocalPriv()
    const { url } = await adminCreateE2EEExport(id)
    const res = await fetch(url)
    if (!res.ok) throw new Error(await res.text())
    const bundle = await res.json()
    const privB64 = btoa(String.fromCharCode(...priv))
    const out:any[] = []
    for (const entry of bundle.responses || []) {
      try {
        const plain = await decryptSingleWithX25519(privB64, { ciphertext: entry.ciphertext, nonce: entry.nonce, enc_dek: entry.enc_dek || entry.EncDEK || [] })
        out.push(plain)
      } catch {
        // skip
      }
    }
    if (out.length === 0) throw new Error(t('e2ee.no_decrypted'))
    const enMap: Record<string,string> = {}
    const zhMap: Record<string,string> = {}
    for (const it of items) {
      enMap[it.id] = it.stem_i18n?.en || it.stem || it.id
      zhMap[it.id] = it.stem_i18n?.zh || it.stem_i18n?.en || it.stem || it.id
    }
    return { out, enMap, zhMap }
  }

  if (isE2EE) {
    return (
      <>
        <h4 className="section-title" style={{marginTop:0}}>{t('export')}</h4>
        <div className="muted" style={{marginBottom:8}}>{t('e2ee.csv_disabled_title')}</div>
        <div className="row" style={{gap:12}}>
          <div className="item span-6">
            <div className="label">{t('e2ee.passphrase')}</div>
            <input className="input" type="password" value={pkPass} onChange={e=> setPkPass(e.target.value)} placeholder={t('e2ee.passphrase_placeholder')} />
            <div className="muted" style={{marginTop:6}}>{t('e2ee.passphrase_help')}</div>
          </div>
          <div className="item span-6">
            <div className="label">{t('e2ee.import_priv_title')}</div>
            <div className="cta-row" style={{marginTop:6}}>
              <button className="btn" type="button" onClick={()=> fileInputRef.current?.click()}>{t('e2ee.import_button')}</button>
              <input ref={fileInputRef} type="file" accept="application/json" style={{display:'none'}} onChange={async(e)=>{
                try {
                  setStatus('')
                  const f = e.target.files?.[0]
                  if (!f) return
                  const text = await f.text()
                  const obj = JSON.parse(text)
                  if (!obj || !obj.enc_priv || !obj.iv || !obj.salt || !obj.pub) throw new Error(t('e2ee.invalid_key_file'))
                  localStorage.setItem('synap_pmk', JSON.stringify(obj))
                  setStatus(t('e2ee.import_ok'))
                  e.currentTarget.value = ''
                } catch(err:any) {
                  setStatus(err.message||String(err))
                }
              }} />
            </div>
            <div className="muted" style={{marginTop:6}}>{t('e2ee.import_priv_desc')}</div>
          </div>
        </div>
        <div className="tile" style={{padding:12, marginTop:12, display:'grid', gap:8}}>
          <button className="btn" type="button" onClick={async()=>{
            try {
              setStatus('')
              const { out, enMap, zhMap } = await decryptCurrentBundle()
              const augmented = out.map((entry:any)=>{
                const answers = entry.answers || {}
                const readableEn: Record<string, any> = {}
                const readableZh: Record<string, any> = {}
                for (const [k, v] of Object.entries(answers)) {
                  readableEn[enMap[k] || k] = v
                  readableZh[zhMap[k] || k] = v
                }
                return { ...entry, answers_readable_en: readableEn, answers_readable_zh: readableZh }
              })
              const blob = new Blob([augmented.map(o=> JSON.stringify(o)).join('\n') + '\n'], { type:'application/jsonl' })
              const anchor = document.createElement('a')
              anchor.href = URL.createObjectURL(blob)
              anchor.download = `e2ee_${id}_plaintext.jsonl`
              anchor.click(); URL.revokeObjectURL(anchor.href)
              setStatus(t('e2ee.local_plain_ready'))
            } catch(err:any) { setStatus(err.message||String(err)) }
          }}>{t('e2ee.local_decrypt_button')}</button>
          <button className="btn" type="button" onClick={async()=>{
            try {
              setStatus('')
              const { out, enMap, zhMap } = await decryptCurrentBundle()
              const header = ['response_index','email','item_id','stem_en','stem_zh','value']
              const lines = [header.map(csvEsc).join(',')]
              out.forEach((entry:any, idx:number)=>{
                const answers = entry.answers || {}
                const email = entry.email || ''
                for (const [k, v] of Object.entries(answers)) {
                  lines.push([
                    csvEsc(idx+1),
                    csvEsc(email),
                    csvEsc(k),
                    csvEsc(enMap[k] || k),
                    csvEsc(zhMap[k] || k),
                    csvEsc(v)
                  ].join(','))
                }
              })
              const csvText = '\uFEFF' + lines.join('\r\n') + '\r\n'
              const blob = new Blob([csvText], { type:'text/csv;charset=utf-8' })
              const anchor = document.createElement('a')
              anchor.href = URL.createObjectURL(blob)
              anchor.download = `e2ee_${id}_long.csv`
              anchor.click(); URL.revokeObjectURL(anchor.href)
              setStatus(t('e2ee.local_csv_long_ready'))
            } catch(err:any) { setStatus(err.message||String(err)) }
          }}>{t('e2ee.local_decrypt_csv_long')}</button>
          <button className="btn" type="button" onClick={async()=>{
            try {
              setStatus('')
              const { out, enMap } = await decryptCurrentBundle()
              const order = items.map((it:any)=> it.id)
              const header = ['response_index','email', ...order.map(key=> enMap[key] || key)]
              const lines = [header.map(csvEsc).join(',')]
              out.forEach((entry:any, idx:number)=>{
                const answers = entry.answers || {}
                const email = entry.email || ''
                const row = [csvEsc(idx+1), csvEsc(email)]
                for (const key of order) row.push(csvEsc((answers as any)[key]))
                lines.push(row.join(','))
              })
              const csvText = '\uFEFF' + lines.join('\r\n') + '\r\n'
              const blob = new Blob([csvText], { type:'text/csv;charset=utf-8' })
              const anchor = document.createElement('a')
              anchor.href = URL.createObjectURL(blob)
              anchor.download = `e2ee_${id}_wide_en.csv`
              anchor.click(); URL.revokeObjectURL(anchor.href)
              setStatus(t('e2ee.local_csv_wide_ready'))
            } catch(err:any) { setStatus(err.message||String(err)) }
          }}>{t('e2ee.local_decrypt_csv_wide')}</button>
        </div>
        {status && <div className="muted" style={{marginTop:8}}>{status}</div>}
        <div className="muted" style={{marginTop:8}}>
          {t('e2ee.csv_notice')} <a className="btn btn-ghost" href="https://github.com/soaringjerry/Synap/blob/main/docs/e2ee.md" target="_blank" rel="noreferrer">{t('learn_more')}</a>
        </div>
      </>
    )
  }

  return (
    <>
      <h4 className="section-title" style={{marginTop:0}}>{t('export')}</h4>
      <div className="muted" style={{marginBottom:8}}>{t('export_panel.csv_bom_hint')}</div>
      <button className="btn btn-ghost" type="button" onClick={()=> setAdvancedOpen(o=> !o)}>{advancedOpen ? t('hide_advanced') : t('show_advanced')}</button>
      {advancedOpen && (
        <div className="tile" style={{padding:12, marginTop:8}}>
          <div className="item" style={{display:'grid', gap:6}}>
            <div className="label">{t('export_panel.consent_header')}</div>
            <select className="select" value={consentHeader} onChange={e=> setConsentHeader(e.target.value as any)}>
              <option value="key">{t('export_panel.consent_header_key')}</option>
              <option value="label_en">{t('export_panel.consent_header_label_en')}</option>
              <option value="label_zh">{t('export_panel.consent_header_label_zh')}</option>
            </select>
            <div className="muted">{t('export_panel.consent_header_help')}</div>
          </div>
        </div>
      )}
      <div className="cta-row" style={{marginTop:12}}>
        <a className="neon-btn" href={`/api/export?format=long&scale_id=${encodeURIComponent(id)}&consent_header=${encodeURIComponent(consentHeader)}`} target="_blank" rel="noreferrer">{t('export_long_csv')}</a>
        <a className="neon-btn" href={`/api/export?format=wide&scale_id=${encodeURIComponent(id)}&consent_header=${encodeURIComponent(consentHeader)}`} target="_blank" rel="noreferrer">{t('export_wide_csv')}</a>
        <a className="neon-btn" href={`/api/export?format=score&scale_id=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">{t('export_score_csv')}</a>
      </div>
    </>
  )
}

function DangerZone({ scaleId }: { scaleId: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const onPurge = async () => {
    try {
      const warn = t('confirm_delete_responses') || 'Delete ALL responses for this scale? This cannot be undone.'
      const promptMsg = `${warn}\n\nType the scale ID to confirm: ${scaleId}`
      const input = window.prompt(promptMsg)
      if (!input || input.trim() !== scaleId) return
      await adminPurgeResponses(scaleId)
      toast.success(t('delete_success'))
    } catch (e:any) {
      toast.error(e.message||String(e))
    }
  }
  return (
    <div className="row" style={{marginTop:16}}>
      <div className="card span-12" style={{borderColor:'rgba(248,113,113,0.45)'}}>
        <h4 className="section-title" style={{marginTop:0}}>{t('danger_zone')}</h4>
        <div className="muted" style={{marginBottom:8}}>{t('confirm_delete_responses')}</div>
        <button type="button" className="btn" onClick={onPurge}>{t('delete_all_responses')}</button>
      </div>
    </div>
  )
}
const LIKERT_PRESETS: Record<string, { en: string[]; zh: string[] }> = {
  numeric: { en: ['1','2','3','4','5'], zh: ['1','2','3','4','5'] },
  agree5: { en: ['Strongly disagree','Disagree','Neutral','Agree','Strongly agree'], zh: ['非常不同意','不同意','中立','同意','非常同意'] },
  freq5: { en: ['Never','Rarely','Sometimes','Often','Always'], zh: ['从不','很少','有时','经常','总是'] },
  agree7: { en: ['Strongly disagree','Disagree','Somewhat disagree','Neutral','Somewhat agree','Agree','Strongly agree'], zh: ['非常不同意','不同意','有点不同意','中立','有点同意','同意','非常同意'] },
  bipolar7: { en: ['Extremely negative','Very negative','Slightly negative','Neutral','Slightly positive','Very positive','Extremely positive'], zh: ['非常负向','很负向','略为负向','中立','略为正向','很正向','非常正向'] },
  mono5: { en: ['Not at all','Slightly','Moderately','Very','Extremely'], zh: ['完全没有','稍微','中等','非常','极其'] },
}
