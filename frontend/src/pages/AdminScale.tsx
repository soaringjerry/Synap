/*
================================================================================
// DEPRECATED COMPONENT //
================================================================================
This file represents the legacy version of the scale editor UI.
It is preserved for backward compatibility and should NOT be used for new feature development.

All new development and bug fixes should be applied to:
/frontend/src/pages/ScaleEditor.tsx

Reason for deprecation: Poor UX, high complexity, and difficult maintenance.
================================================================================
*/
import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminGetScale, adminGetScaleItems, adminUpdateScale, adminDeleteScale, adminUpdateItem, adminDeleteItem, adminCreateItem, adminAnalyticsSummary, adminAITranslatePreview, adminListProjectKeys, adminAddProjectKey, adminCreateE2EEExport, adminPurgeResponses, adminGetAIConfig, adminReorderItems } from '../api/client'
import { decryptSingleWithX25519 } from '../crypto/e2ee'
import { useToast } from '../components/Toast'

export function AdminScale() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const [scale, setScale] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [newStemEn, setNewStemEn] = useState('')
  const [newStemZh, setNewStemZh] = useState('')
  const newStemEnRef = useRef<HTMLInputElement|null>(null)
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
  const [shareLang, setShareLang] = useState<'en'|'zh'|'auto'>('auto')
  const [analytics, setAnalytics] = useState<any|null>(null)
  const [aiTargets, setAiTargets] = useState('zh')
  const [aiPreview, setAiPreview] = useState<any|null>(null)
  const [aiMsg, setAiMsg] = useState('')
  const [aiReady, setAiReady] = useState(false)
  const [aiWorking, setAiWorking] = useState(false)
  const [aiInclude, setAiInclude] = useState<Record<string, boolean>>({})
  // Likert anchors
  const [likertLabelsEn, setLikertLabelsEn] = useState<string>('')
  const [likertLabelsZh, setLikertLabelsZh] = useState<string>('')
  const [likertShowNumbers, setLikertShowNumbers] = useState<boolean>(true)
  const [likertPreset, setLikertPreset] = useState<string>('numeric')
  const [turnstile, setTurnstile] = useState<boolean>(true)
  const [itemsPerPage, setItemsPerPageState] = useState<string>('0')
  const [keys, setKeys] = useState<any[]>([])
  const [newPub, setNewPub] = useState('')
  const [newAlg, setNewAlg] = useState<'x25519+xchacha20'|'rsa+aesgcm'>('x25519+xchacha20')
  const [newKdf] = useState<'hkdf-sha256'>('hkdf-sha256')
  const [newFp, setNewFp] = useState('')
  const [pkPass, setPkPass] = useState('')
  const [decMsg, setDecMsg] = useState('')
  const toast = useToast()
  // Debounced autosave for consent advanced edits
  const saveDebounce = React.useRef<number | undefined>(undefined)
  const autosave = (nextOpts?: typeof consentOptions, nextSig?: boolean) => {
    if (saveDebounce.current) window.clearTimeout(saveDebounce.current)
    saveDebounce.current = window.setTimeout(() => {
      saveConsentWith(nextOpts, nextSig)
    }, 600)
  }
  // UI state for adding a custom consent item
  const [newConsent, setNewConsent] = useState<{ en: string; zh: string; required: boolean; key: string; open: boolean }>({ en: '', zh: '', required: false, key: '', open: false })
  const [flashKey, setFlashKey] = useState<string>('')
  function highlight(key: string) {
    setFlashKey(key)
    window.setTimeout(()=> setFlashKey(''), 1000)
  }
  function addTemplate(key: 'withdrawal'|'data_use'|'recording', required: boolean) {
    const exists = consentOptions.some(o=> o.key === key)
    if (exists) {
      highlight(key)
      toast.info(t('consent.advanced.already_added') as string || 'Already added')
      return
    }
    const en = i18n.t(`survey.consent_opt.${key}`, { lng: 'en' }) as string
    const zh = i18n.t(`survey.consent_opt.${key}`, { lng: 'zh' }) as string
    const next = [...consentOptions, { key, required, en, zh }]
    setConsentOptions(next)
    saveConsentWith(next)
    highlight(key)
  }
  // Helper: decrypt current export bundle into plain objects
  async function decryptCurrentBundle(): Promise<{ out: any[], enMap: Record<string,string>, zhMap: Record<string,string>, consentCols: { key:string; en:string; zh:string }[] }> {
    const priv = await unlockLocalPriv()
    const { url } = await adminCreateE2EEExport(id)
    const res = await fetch(url)
    if (!res.ok) throw new Error(await res.text())
    const bundle = await res.json()
    const out:any[] = []
    const privB64 = btoa(String.fromCharCode(...priv))
    for (const r of bundle.responses||[]) {
      try {
        const plain = await decryptSingleWithX25519(privB64, { ciphertext: r.ciphertext, nonce: r.nonce, enc_dek: r.enc_dek||r.EncDEK||[] })
        out.push(plain)
      } catch {}
    }
    if (out.length===0) throw new Error('No entries could be decrypted with the provided key')
    const enMap: Record<string,string> = {}
    const zhMap: Record<string,string> = {}
    for (const it of items) {
      enMap[it.id] = (it.stem_i18n?.en || it.stem || it.id)
      zhMap[it.id] = (it.stem_i18n?.zh || it.stem_i18n?.en || it.stem || it.id)
    }
    const consentOpts = Array.isArray(scale?.consent_config?.options) ? scale.consent_config.options : []
    const consentCols = consentOpts.map((opt:any) => {
      const fbEn = i18n.t(`survey.consent_opt.${opt.key}`, { lng: 'en' }) as string
      const fbZh = i18n.t(`survey.consent_opt.${opt.key}`, { lng: 'zh' }) as string
      const fallbackEn = fbEn && !fbEn.startsWith('survey.consent_opt.') ? fbEn : opt.key
      const fallbackZhSrc = fbZh && !fbZh.startsWith('survey.consent_opt.') ? fbZh : fallbackEn
      return {
        key: opt.key,
        en: opt.label_i18n?.en || fallbackEn,
        zh: opt.label_i18n?.zh || opt.label_i18n?.en || fallbackZhSrc,
      }
    })
    return { out, enMap, zhMap, consentCols }
  }

  function csvEsc(v: any): string {
    const s = (v===null||v===undefined) ? '' : (Array.isArray(v) ? v.join(', ') : (typeof v==='object' ? JSON.stringify(v) : String(v)))
    return '"' + s.replace(/"/g, '""') + '"'
  }
  // Consent settings edit
  const [consentVersion, setConsentVersion] = useState('')
  const [signatureRequired, setSignatureRequired] = useState(true)
  const [consentOptions, setConsentOptions] = useState<{ key:string; required:boolean; en?:string; zh?:string; group?: number }[]>([])
  const [showAdvancedConsent, setShowAdvancedConsent] = useState(false)
  function getOpt(key:string){ return consentOptions.find(o=> o.key===key) }
  function setOptRequired(key:string, v:boolean){
    setConsentOptions(list=> {
      const idx = list.findIndex(o=> o.key===key)
      if (idx===-1) return [...list, { key, required: v }]
      const a=[...list]; a[idx] = { ...a[idx], required: v }; return a
    })
  }
  async function saveConsentWith(nextOpts?: typeof consentOptions, nextSig?: boolean) {
    try {
      const options = (nextOpts || consentOptions).map(o=> ({ key:o.key.trim(), required: !!o.required, group: (typeof o.group==='number' && o.group>0) ? o.group : undefined, label_i18n: { en: o.en || undefined, zh: o.zh || undefined } }))
      await adminUpdateScale(id, { consent_config: { version: consentVersion||'v1', options, signature_required: typeof nextSig==='boolean'? nextSig : !!signatureRequired } } as any)
      setMsg(t('saved') as string)
      toast.success(t('save_success')||t('saved')||'Saved')
    } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }
  function sanitizeKey(input: string) {
    return input.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '').slice(0, 32)
  }
  function applyConsentPreset(preset: 'minimal'|'recommended'|'strict'){
    if (preset==='minimal'){
      setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:false}])
      setSignatureRequired(false)
    } else if (preset==='recommended'){
      setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:false}])
      setSignatureRequired(true)
    } else {
      setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:true}])
      setSignatureRequired(true)
    }
  }
  async function saveConsentConfig() {
    try {
      const keys = consentOptions.map(o=> o.key.trim())
      const hasEmpty = keys.some(k=> !k)
      const dup = keys.find((k, i)=> k && keys.indexOf(k) !== i)
      if (hasEmpty || dup) {
        toast.error(t('consent.advanced.save_first_error')||'Please fix highlighted fields')
        return
      }
      const options = consentOptions.map(o=> ({ key:o.key.trim(), required: !!o.required, label_i18n: { en: o.en || undefined, zh: o.zh || undefined } }))
      await adminUpdateScale(id, { consent_config: { version: consentVersion||'v1', options, signature_required: !!signatureRequired } } as any)
      setMsg(t('saved') as string)
      toast.success(t('save_success')||t('saved')||'Saved')
    } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }
  const fileInputRef = React.useRef<HTMLInputElement|null>(null)

  async function unlockLocalPriv(): Promise<Uint8Array> {
    const blobStr = localStorage.getItem('synap_pmk')
    if (!blobStr) throw new Error('No local private key found. Go to Keys page to generate.')
    const blob = JSON.parse(blobStr)
    if (!pkPass) throw new Error('Enter passphrase to unlock private key')
    const salt = fromB64(blob.salt)
    const iv = fromB64(blob.iv)
    const enc = fromB64(blob.enc_priv)
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pkPass), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt: salt.buffer, iterations: 120000, hash: 'SHA-256' }, keyMaterial, { name:'AES-GCM', length:256 }, false, ['decrypt'])
    const privAb = await crypto.subtle.decrypt({ name:'AES-GCM', iv: iv.buffer }, key, enc.buffer)
    return new Uint8Array(privAb)
  }
  function fromB64(s: string) { const bin=atob(s); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u }

  async function load() {
    setMsg('')
    try {
      const s = await adminGetScale(id)
      const its = await adminGetScaleItems(id)
      setScale(s)
      setTurnstile(!!(s as any).turnstile_enabled)
      const labs = (s as any).likert_labels_i18n || {}
      setLikertLabelsEn((labs.en||[]).join(', '))
      setLikertLabelsZh((labs.zh||[]).join('，'))
      setLikertShowNumbers(!!(s as any).likert_show_numbers)
      setLikertPreset((s as any).likert_preset || 'numeric')
      setItemsPerPageState(String((s as any).items_per_page || 0))
      // init consent config state
      const cc = (s as any).consent_config || {}
      setConsentVersion(cc.version||'v1')
      setSignatureRequired(!!(cc.signature_required ?? true))
      const opts = (cc.options||[]).map((o:any)=> ({ key:o.key, required: !!o.required, en: o.label_i18n?.en, zh: o.label_i18n?.zh, group: (typeof (o as any).group === 'number' && (o as any).group > 0) ? (o as any).group : 1 }))
      setConsentOptions(opts)
      if (!opts || opts.length === 0) {
        applyConsentPreset('recommended')
      }
      setItems(its.items||[])
      try { const a = await adminAnalyticsSummary(id); setAnalytics(a) } catch {}
      try { const k = await adminListProjectKeys(id); setKeys(k.keys||[]) } catch {}
      try { const cfg = await adminGetAIConfig(); setAiReady(!!cfg.openai_key && !!cfg.allow_external) } catch {}
    } catch (e:any) { setMsg(e.message||String(e)) }
  }
  useEffect(()=>{ load() }, [id])
  useEffect(() => {
    const el = newStemEnRef.current
    if (!el) return
    const pos = el.value.length
    el.focus()
    try { el.setSelectionRange(pos, pos) } catch {}
  }, [newStemEn])

  async function saveScale() {
    try {
      setSaving(true)
      const labsEn = likertLabelsEn.split(/[,，]/).map(s=>s.trim()).filter(Boolean)
      const labsZh = likertLabelsZh.split(/[,，]/).map(s=>s.trim()).filter(Boolean)
      const likert_labels_i18n: any = {}
      if (labsEn.length) likert_labels_i18n.en = labsEn
      if (labsZh.length) likert_labels_i18n.zh = labsZh
      const ipp = parseInt(itemsPerPage||'0')
      await adminUpdateScale(id, { name_i18n: scale.name_i18n, randomize: !!scale.randomize, consent_i18n: scale.consent_i18n, collect_email: scale.collect_email, e2ee_enabled: !!scale.e2ee_enabled, region: scale.region||'auto', items_per_page: isNaN(ipp)? 0 : ipp, turnstile_enabled: !!turnstile, likert_labels_i18n, likert_show_numbers: likertShowNumbers, likert_preset: likertPreset } as any)
      setMsg(t('saved'))
      toast.success(t('save_success')||t('saved')||'Saved')
    } catch(e:any) { setMsg(e.message||String(e)) } finally { setSaving(false) }
  }

  async function removeScale() {
    if (!confirm(t('confirm_delete_scale'))) return
    try { await adminDeleteScale(id); setMsg(t('deleted')); toast.success(t('delete_success')||t('deleted')||'Deleted'); setScale(null); setItems([]) } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }

  async function saveItem(it:any) {
    try {
      const upd:any = { reverse_scored: !!it.reverse_scored, stem_i18n: it.stem_i18n, type: it.type, required: !!it.required }
      if (!it.type || it.type==='likert') {
        if (it.likert_labels_i18n) upd.likert_labels_i18n = it.likert_labels_i18n
        if (typeof it.likert_show_numbers==='boolean') upd.likert_show_numbers = !!it.likert_show_numbers
      }
      await adminUpdateItem(it.id, upd)
      setMsg(t('saved'))
      toast.success(t('save_success')||t('saved')||'Saved')
    } catch(e:any) { setMsg(e.message||String(e)) }
  }
  async function removeItem(itemId:string) {
    if (!confirm(t('confirm_delete_item'))) return
    try { await adminDeleteItem(itemId); setItems(items.filter(x=>x.id!==itemId)); setMsg(t('deleted')); toast.success(t('delete_success')||t('deleted')||'Deleted') } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
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
      setNewStemEn(''); setNewStemZh(''); setNewReverse(false); setNewType('likert'); setNewRequired(false); setNewOptsEn(''); setNewOptsZh(''); setNewMin(''); setNewMax(''); setNewStep(''); setNewPhEn(''); setNewPhZh(''); setLikertLabelsEn(''); setLikertLabelsZh(''); setLikertShowNumbers(true)
    } catch(e:any) { setMsg(e.message||String(e)) }
  }

  function PreviewBubbleRow({ count }:{ count:number }) {
    return (
      <div className="scale">
        {Array.from({length: count}, (_,i)=> i+1).map(x=> (
          <button key={x} className={`bubble ${x===Math.ceil(count/2)?'active':''}`}>{x}</button>
        ))}
      </div>
    )
  }

  function renderNewPreview() {
    const pts = Number(scale?.points || 5)
    const opts = (newOptsEn || 'Option A\nOption B').split(/\n/).map(s=>s.trim()).filter(Boolean).slice(0,3)
    const min = newMin!=='' ? Number(newMin) : 0
    const max = newMax!=='' ? Number(newMax) : (newType==='rating'?10:100)
    const step = newStep!=='' ? Number(newStep) : 1
    switch (newType) {
      case 'likert':
        return <PreviewBubbleRow count={pts} />
      case 'single':
        return <div>{opts.map(o=> (
          <label key={o} style={{display:'inline-flex',gap:6,marginRight:12,alignItems:'center'}}>
            <input className="radio" type="radio" checked={o===opts[0]} readOnly /> {o}
          </label>
        ))}</div>
      case 'multiple':
        return <div>{opts.map((o,i)=> (
          <label key={o} style={{display:'inline-flex',gap:6,marginRight:12,alignItems:'center'}}>
            <input className="checkbox" type="checkbox" checked={i===0} readOnly /> {o}
          </label>
        ))}</div>
      case 'dropdown':
        return <select className="select" defaultValue={opts[0]||''}>{opts.map(o=> <option key={o} value={o}>{o}</option>)}</select>
      case 'rating':
        return <PreviewBubbleRow count={Math.max(1, (max-min+1))} />
      case 'numeric':
        return <input className="input" type="number" min={min} max={max} step={step} defaultValue={min} readOnly />
      case 'slider':
        return <input className="input" type="range" min={min} max={max} step={step} defaultValue={min + Math.floor((max-min)/2)} readOnly />
      case 'short_text':
        return <input className="input" type="text" placeholder={newPhEn||'Short answer...'} readOnly />
      case 'long_text':
        return <textarea className="input" rows={4} placeholder={newPhEn||'Long answer...'} readOnly />
      case 'date':
        return <input className="input" type="date" readOnly />
      case 'time':
        return <input className="input" type="time" readOnly />
      default:
        return null
    }
  }

  if (!scale) return <div className="card span-12"><div className="muted">{t('loading')}…</div>{msg && <div className="muted">{msg}</div>}</div>

  return (
    <div className="container">
      {/* Quick nav tabs (sticky) */}
      <div className="tabs-nav" style={{position:'sticky', top:72, zIndex:40, marginBottom:12}}>
        <button className="tab" onClick={()=> document.getElementById('sec-basics')?.scrollIntoView({behavior:'smooth', block:'start'})}>{t('manage_scale')||'Basics'}</button>
        <button className="tab" onClick={()=> document.getElementById('sec-items')?.scrollIntoView({behavior:'smooth', block:'start'})}>{t('your_items')||'Items'}</button>
        <button className="tab" onClick={()=> document.getElementById('sec-security')?.scrollIntoView({behavior:'smooth', block:'start'})}>{t('e2ee.title')||'Security'}</button>
        <button className="tab" onClick={()=> document.getElementById('sec-analytics')?.scrollIntoView({behavior:'smooth', block:'start'})}>{t('analytics')||'Analytics'}</button>
        <button className="tab" onClick={()=> document.getElementById('sec-overview')?.scrollIntoView({behavior:'smooth', block:'start'})}>{t('participant_link')||'Share'}</button>
      </div>
      <div className="row">
        <section className="card span-12">
          <h3 id="sec-overview" style={{marginTop:0}}>{t('participant_link')||'Participant Link'}</h3>
          <div className="item" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <div className="label">{t('language')}</div>
            <select className="select" style={{maxWidth:200}} value={shareLang} onChange={e=> setShareLang((e.target.value as any))}>
              <option value="auto">{t('lang_auto')||'Auto (detect browser)'}</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
            <input className="input" readOnly value={`${window.location.origin}/survey/${encodeURIComponent(id)}${shareLang==='auto' ? '' : `?lang=${shareLang}`}`} />
            <button className="btn" onClick={async()=>{
              const url = `${window.location.origin}/survey/${encodeURIComponent(id)}${shareLang==='auto' ? '' : `?lang=${shareLang}`}`
              try { await navigator.clipboard.writeText(url); setMsg(t('copied') as string) } catch { setMsg(url) }
            }}>{t('copy')||'Copy'}</button>
            <a className="btn btn-ghost" href={`${window.location.origin}/survey/${encodeURIComponent(id)}${shareLang==='auto' ? '' : `?lang=${shareLang}`}`} target="_blank" rel="noreferrer">{t('open')||'Open'}</a>
          </div>
          <div className="muted">{t('share_desc')||'Share this URL with participants. The link opens the survey directly.'}</div>
        </section>
      </div>
      <div className="row">
        <section className="card span-12">
          <h3 style={{marginTop:0}}>AI Translation</h3>
          <div className="muted" style={{marginBottom:8}}>
            {t('ai.steps')||'Steps: 1) Configure provider, 2) Pick target languages, 3) Preview, 4) Apply.'}
          </div>
          <div className="item" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <div className="label">{t('ai.targets')||'Target languages (comma)'}</div>
            <input className="input" style={{maxWidth:300}} value={aiTargets} onChange={e=> setAiTargets(e.target.value)} placeholder="zh,en,fr" />
            <div className="cta-row">
              <button className="btn btn-ghost" onClick={()=> setAiTargets('zh')}>EN→ZH</button>
              <button className="btn btn-ghost" onClick={()=> setAiTargets('en')}>ZH→EN</button>
              <button className="btn btn-ghost" onClick={()=> setAiTargets('zh,en,fr,de')}>+Common</button>
            </div>
            <a className="btn btn-ghost" href="/admin/ai" target="_blank" rel="noreferrer">{t('ai.provider')||'Provider Settings'}</a>
            <button className="btn" disabled={!aiReady || aiWorking} onClick={async()=>{
              setAiMsg(''); setAiWorking(true)
              try {
                const langs = aiTargets.split(',').map(s=>s.trim()).filter(Boolean)
                const p = await adminAITranslatePreview(id, langs)
                setAiPreview(p)
                // default include ON for all items
                const inc: Record<string,boolean> = {}
                for (const it of items) inc[it.id] = true
                setAiInclude(inc)
              } catch(e:any) { setAiMsg(e.message||String(e)) } finally { setAiWorking(false) }
            }}>{aiWorking ? (t('loading')||'Loading') : (t('preview')||'Preview')}</button>
          </div>
          {!aiReady && <div className="tile" style={{padding:8, border:'1px solid #b36b00', background:'#fffaf0', color:'#b36b00'}}>{t('ai.not_ready')||'Provider not configured or external AI disabled. Set API key and enable external AI in Provider Settings.'}</div>}
          {aiMsg && <div className="muted">{aiMsg}</div>}
          {aiPreview && (
            <div className="item" style={{overflowX:'auto'}}>
              <div className="muted">{t('ai.review')||'Review translations and click Apply to save into item stems.'}</div>
              {items.map((it:any)=> (
                <div key={it.id} style={{borderTop:'1px solid var(--border)', paddingTop:12, marginTop:8}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
                    <label style={{display:'inline-flex',alignItems:'center',gap:6}}><input className="checkbox" type="checkbox" checked={!!aiInclude[it.id]} onChange={e=> setAiInclude(s=> ({...s, [it.id]: e.target.checked}))} />Include</label>
                    <div><b>{it.id}</b> · {it.stem_i18n?.en || it.id}</div>
                  </div>
                  <div className="row">
                    {Object.entries((aiPreview.items||{})[it.id]||{}).map(([lang, val]: any)=> (
                      <div key={lang} className="card span-6">
                        <div className="label">{lang}</div>
                        <textarea className="input" rows={3} defaultValue={val as string} onChange={e=> {
                          // mutate local preview cache for edits
                          setAiPreview((p:any)=> ({...p, items: {...p.items, [it.id]: {...(p.items[it.id]||{}), [lang]: e.target.value }}}))
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="cta-row" style={{marginTop:12}}>
                <button className="btn btn-primary" onClick={async()=>{
                  try {
                    // apply to items via existing update API
                    for (const it of items) {
                      if (!aiInclude[it.id]) continue
                      const add = (aiPreview.items||{})[it.id]||{}
                      if (Object.keys(add).length===0) continue
                      await adminUpdateItem(it.id, { stem_i18n: { ...(it.stem_i18n||{}), ...(add as any) } })
                    }
                    // apply to scale name/consent if provided
                    const upd:any = {}
                    if (aiPreview.name_i18n) upd.name_i18n = { ...(scale.name_i18n||{}), ...aiPreview.name_i18n }
                    if (aiPreview.consent_i18n) upd.consent_i18n = { ...(scale.consent_i18n||{}), ...aiPreview.consent_i18n }
                    if (Object.keys(upd).length>0) await adminUpdateScale(id, upd)
      setMsg(t('saved') as string)
      toast.success(t('save_success')||t('saved')||'Saved')
                    setAiPreview(null)
                    load()
                  } catch(e:any) { setMsg(e.message||String(e)) }
                }}>Apply</button>
                <button className="btn btn-ghost" onClick={()=> setAiPreview(null)}>Discard</button>
              </div>
            </div>
          )}
        </section>
      </div>
      <div className="row">
        <section className="card span-12">
          <h3 id="sec-security" style={{marginTop:0}}>{t('e2ee.title')||'End‑to‑end Encryption'}</h3>
          <div className="row">
            <div className="card span-6">
              <div className="item"><div className="label">End‑to‑end Encryption</div>
                <div><b>{scale.e2ee_enabled ? 'ON' : 'OFF'}</b> · <span className="muted">{t('e2ee.locked_after_creation')||'Locked after creation'}</span></div>
                <div className="muted">{t('e2ee.desc')||'Encrypt answers in the browser. Server stores only ciphertext.'}</div>
              </div>
              <div className="item"><div className="label">Region</div>
                <div>{scale.region||'auto'} · <span className="muted">{t('e2ee.locked_after_creation')||'Locked after creation'}</span></div>
              </div>
              {(() => {
                const r = scale.region||'auto'
                if (!scale.e2ee_enabled && (r==='gdpr'||r==='pipl')) return <div className="tile" style={{border:'1px solid #e00', color:'#e00', background:'#fff6f6', padding:8}}>{t('e2ee.region_strong')||'Warning: In GDPR/PIPL regions, E2EE is strongly recommended.'}</div>
                if (!scale.e2ee_enabled && (r==='pdpa'||r==='ccpa')) return <div className="tile" style={{border:'1px solid #b36b00', color:'#b36b00', background:'#fffaf0', padding:8}}>{t('e2ee.region_soft')||'Note: Consider enabling E2EE for better privacy.'}</div>
                if (scale.e2ee_enabled) return <div className="muted">{t('e2ee.enabled_hint')||'E2EE is ON. Only recipients with project keys can decrypt.'}</div>
                return null
              })()}
              {/* No save here; E2EE/Region locked */}
            </div>
            <div className="card span-6">
              <h4 style={{marginTop:0}}>{t('e2ee.project_keys')||'Project Keys'}</h4>
              <div className="muted">{t('e2ee.project_keys_readonly')||'Registered recipients (read‑only). Keys are set at creation.'}</div>
              <div className="divider" />
              <div className="item"><div className="label">{t('e2ee.keys_registered')||'Registered Keys'}</div>
                {keys.length===0 && <div className="muted">No keys</div>}
                {keys.map((k:any)=> (
                  <div key={k.fingerprint} className="tile" style={{padding:10, marginTop:8}}>
                    <div><b>{k.alg}</b> · {k.kdf} · <span className="muted">{k.fingerprint}</span></div>
                    <div className="muted">{k.created_at ? new Date(k.created_at).toLocaleString() : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="divider" />
          <div className="row">
            <div className="card span-12">
              <h4 style={{marginTop:0}}>{t('consent_settings')||'Consent Settings'}</h4>
              {/* Simple mode */}
              <div className="tile" style={{padding:10, marginBottom:8}}>
                <div className="muted" style={{marginBottom:6}}>{t('consent.presets_title')||'Pick a preset (you can still tweak below):'}</div>
                <div className="cta-row">
                  <button className="btn" onClick={()=> applyConsentPreset('minimal')}>{t('consent.preset_min')||'Minimal'}</button>
                  <button className="btn" onClick={()=> applyConsentPreset('recommended')}>{t('consent.preset_rec')||'Recommended'}</button>
                  <button className="btn" onClick={()=> applyConsentPreset('strict')}>{t('consent.preset_strict')||'Strict'}</button>
                </div>
              </div>
              <div className="tile" style={{padding:10}}>
                <div className="muted" style={{marginBottom:6}}>{t('consent.simple_title')||'Ask participants to confirm:'} · <span className="muted">{t('consent.simple_modes')||'Each item can be Off / Optional / Required'}</span></div>
                {[{key:'withdrawal', label: t('survey.consent_opt.withdrawal')||'I understand I can withdraw at any time.'},
                  {key:'data_use', label: t('survey.consent_opt.data_use')||'I understand my data is for academic/aggregate use only.'},
                  {key:'recording', label: t('survey.consent_opt.recording')||'I consent to audio/video recording where applicable.'}
                ].map(row=>{
                  const cur = getOpt(row.key)
                  const mode: 'off'|'optional'|'required' = !cur? 'off' : (cur.required? 'required':'optional')
                  const setMode = (m:'off'|'optional'|'required')=>{
                    let next = consentOptions
                    if (m==='off') next = consentOptions.filter(o=> o.key!==row.key)
                    if (m==='optional') next = consentOptions.some(o=>o.key===row.key)? consentOptions.map(o=> o.key===row.key? {...o, required:false}:o) : [...consentOptions, {key:row.key, required:false}]
                    if (m==='required') next = consentOptions.some(o=>o.key===row.key)? consentOptions.map(o=> o.key===row.key? {...o, required:true}:o) : [...consentOptions, {key:row.key, required:true}]
                    setConsentOptions(next as any); saveConsentWith(next)
                  }
                  const btnCls = (m:string)=> `btn ${mode===m?'btn-primary':''}`
                  return (
                    <div key={row.key} className="item" style={{display:'grid', gap:8}}>
                      <div className="label">{row.label}</div>
                      <div className="cta-row">
                        <button className={btnCls('off')} onClick={()=>setMode('off')}>{t('collect_email_off')||'Off'}</button>
                        <button className={btnCls('optional')} onClick={()=>setMode('optional')}>{t('collect_email_optional')||'Optional'}</button>
                        <button className={btnCls('required')} onClick={()=>setMode('required')}>{t('collect_email_required')||'Required'}</button>
                      </div>
                    </div>
                  )
                })}
                <label className="item" style={{display:'flex',alignItems:'center',gap:8, marginTop:6}}>
                  <input className="checkbox" type="checkbox" checked={signatureRequired} onChange={e=> { setSignatureRequired(e.target.checked); saveConsentWith(undefined, e.target.checked) }} /> {t('consent.require_signature')||'Require signature'}
                </label>
                <div className="cta-row" style={{marginTop:8}}>
                  <button className="btn btn-primary" onClick={saveConsentConfig}>{t('save')}</button>
                  <button className="btn btn-ghost" onClick={()=> setShowAdvancedConsent(s=> !s)}>{showAdvancedConsent? (t('consent.hide_advanced')||'Hide Advanced') : (t('consent.show_advanced')||'Show Advanced')}</button>
                </div>
                <div className="muted" style={{marginTop:6}}>{t('consent.simple_hint')||'These are the common confirmations. Click “Advanced” to add your own items.'}</div>
              </div>
              {/* Advanced editor (refactored) */}
              {showAdvancedConsent && (
                <div className="tile" style={{padding:10, marginTop:8}}>
                  <div className="row">
                    <div className="card span-4">
                      <div className="label">Version</div>
                      <input className="input" value={consentVersion} onChange={e=> { setConsentVersion(e.target.value); autosave() }} placeholder="v1" />
                      <div className="muted" style={{marginTop:6}}>{t('consent.advanced.version_hint')||'Increase version when content changes; helps manage re‑consent later.'}</div>
                    </div>
                    <div className="card span-4">
                      <div className="label">Signature</div>
                      <label style={{display:'inline-flex',gap:6,alignItems:'center'}}>
                        <input className="checkbox" type="checkbox" checked={signatureRequired} onChange={e=> { setSignatureRequired(e.target.checked); autosave(undefined, e.target.checked) }} /> {t('consent.require_signature')||'Require signature'}
                      </label>
                      <div className="muted" style={{marginTop:6}}>{t('consent.advanced.signature_hint')||'When ON, participants must click or draw a signature.'}</div>
                    </div>
                  </div>
                  <div className="muted" style={{marginTop:8}}>
                    {t('consent.advanced.key_help_export') || 'Exports can use human‑readable labels as column names. Fields here control what participants see.'}
                  </div>
                  {/* Items table-like layout */}
                  <div style={{marginTop:8}}>
                    <div style={{display:'grid', gridTemplateColumns:'1.2fr 1.2fr 0.6fr 0.6fr 0.6fr', gap:8, fontWeight:600, color:'var(--muted)'}}>
                      <div>{t('consent.advanced.label_en')||'Label (EN)'}</div>
                      <div>{t('consent.advanced.label_zh')||'Label (ZH)'}</div>
                      <div>{t('consent.advanced.required')||'Required'}</div>
                      <div>{t('label.position')||'Position'}</div>
                      <div>{t('delete')||'Delete'}</div>
                    </div>
                    {(consentOptions||[]).map((o, idx)=>{
                      const keys = consentOptions.map(x=> x.key.trim())
                      const isDup = o.key && keys.indexOf(o.key.trim()) !== keys.lastIndexOf(o.key.trim())
                      const keyErr = !o.key?.trim() || isDup
                      return (
                        <div key={idx} style={{display:'grid', gridTemplateColumns:'1.2fr 1.2fr 0.6fr 0.6fr 0.6fr', gap:8, alignItems:'center', marginTop:8, outline: flashKey===o.key? '2px solid var(--accent, #4f46e5)' : undefined, borderRadius: 6, padding: flashKey===o.key? 6 : 0}}>
                          <div>
                            <input className="input" value={o.en||''} onChange={e=> { setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, en: e.target.value}:x)); autosave() }} placeholder={(o.key && t(`survey.consent_opt.${o.key}` as any) as string) || 'Optional'} />
                          </div>
                          <div>
                            <input className="input" value={o.zh||''} onChange={e=> { setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, zh: e.target.value}:x)); autosave() }} placeholder={(o.key && t(`survey.consent_opt.${o.key}` as any) as string) || '可选'} />
                          </div>
                          <div>
                            <label style={{display:'inline-flex',gap:6,alignItems:'center'}}>
                              <input className="checkbox" type="checkbox" checked={o.required} onChange={e=> { setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, required: e.target.checked}:x)); autosave() }} /> required
                            </label>
                          </div>
                          <div>
                            <input className="input" type="number" min={1} max={999} value={(o as any).order || (idx+1)} onChange={e=> { const v = Math.max(1, Math.min(999, parseInt(e.target.value||String(idx+1)))); setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, order: v}:x)); autosave() }} />
                          </div>
                          <div>
                            <button className="btn btn-ghost" onClick={()=> { const next = consentOptions.filter((_,i)=> i!==idx); setConsentOptions(next); saveConsentWith(next) }}>{t('delete')||'Delete'}</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Add new item */}
                  <div className="tile" style={{padding:8, marginTop:12}}>
                    {!newConsent.open ? (
                      <button className="btn" onClick={()=> setNewConsent(v=> ({...v, open:true}))}>{t('consent.advanced.add_option')||'Add option'}</button>
                    ) : (
                      <div style={{display:'grid', gridTemplateColumns:'1.4fr 1.4fr 0.8fr 0.8fr', gap:8, alignItems:'end'}}>
                        <div>
                          <div className="label">{t('consent.advanced.label_en')||'Label (EN)'}</div>
                          <input className="input" value={newConsent.en} onChange={e=> setNewConsent(v=> ({...v, en: e.target.value}))} placeholder="e.g., I agree to ..." />
                        </div>
                        <div>
                          <div className="label">{t('consent.advanced.label_zh')||'Label (ZH)'}</div>
                          <input className="input" value={newConsent.zh} onChange={e=> setNewConsent(v=> ({...v, zh: e.target.value}))} placeholder="例如：我同意…" />
                        </div>
                        <div>
                          <div className="label">{t('consent.advanced.required')||'Required'}</div>
                          <label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={newConsent.required} onChange={e=> setNewConsent(v=> ({...v, required: e.target.checked}))} /> required</label>
                        </div>
                            <div className="cta-row" style={{gap:8}}>
                          <button className="btn" onClick={()=>{
                            let k = sanitizeKey(newConsent.key.trim() || newConsent.en || newConsent.zh || `custom_${consentOptions.length+1}`)
                            if (!k) return
                            // ensure unique key silently by suffixing
                            const base = k
                            let i = 2
                            while (consentOptions.some(o=> o.key===k)) { k = `${base}_${i++}` }
                            const next = [...consentOptions, { key: k, required: newConsent.required, en: newConsent.en || undefined, zh: newConsent.zh || undefined }]
                            setConsentOptions(next)
                            saveConsentWith(next)
                            setNewConsent({ en:'', zh:'', required:false, key:'', open:false })
                          }}>{t('create')||'Create'}</button>
                          <button className="btn btn-ghost" onClick={()=> setNewConsent({ en:'', zh:'', required:false, key:'', open:false })}>{t('cancel')||'Cancel'}</button>
                            </div>
                      </div>
                    )}
                  </div>
                  <div className="cta-row" style={{marginTop:8}}>
                    <div className="label" style={{marginRight:8}}>{t('consent.advanced.add_templates')||'Quick add (templates):'}</div>
                    <button className="btn" onClick={()=> addTemplate('withdrawal', true)}>{t('survey.consent_opt.withdrawal')||'Withdrawal'}</button>
                    <button className="btn" onClick={()=> addTemplate('data_use', true)}>{t('survey.consent_opt.data_use')||'Data use'}</button>
                    <button className="btn" onClick={()=> addTemplate('recording', false)}>{t('survey.consent_opt.recording')||'Recording'}</button>
                    <div style={{flex:1}} />
                    <button className="btn btn-ghost" onClick={()=>{ if (confirm(t('confirm_reset')||'Reset to recommended?')) { applyConsentPreset('recommended'); setTimeout(()=> saveConsentWith(), 0) } }}>{t('consent.advanced.reset_rec')||'Reset to Recommended'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="row">
            <div className="card span-12">
              <h4 style={{marginTop:0}}>{t('e2ee.export_title')||'Export & Evidence'}</h4>
              <div className="item">
                <div className="label">{t('e2ee.export_bundle_title')||'Encrypted Bundle (.json)'}</div>
                <div className="muted">{t('e2ee.export_bundle_desc')||'Contains: manifest (version, type, scale_id, count, created_at) + Ed25519 signature + encrypted responses. For archival and offline decryption.'}</div>
              </div>
              <div className="cta-row" style={{marginTop:8}}>
                <button className="btn btn-primary" onClick={async()=>{
                  try {
                    const { url } = await adminCreateE2EEExport(id)
                    window.open(url, '_blank')
                    setMsg(t('e2ee.export_ready')||'Export link opened.')
                  } catch(e:any) { setMsg(e.message||String(e)) }
                }}>{t('e2ee.export_button')||'Create Export'}</button>
                <div style={{flex:1}} />
                <div className="muted">{t('e2ee.local_export_desc')||'Local plaintext export decrypts in your browser (private key never leaves your device). Default format: JSONL.'}</div>
              </div>
              <div className="row" style={{marginTop:8, alignItems:'flex-end'}}>
                <div className="item span-4"><div className="label">{t('e2ee.passphrase')||'Local private‑key passphrase'}</div>
                  <input className="input" type="password" value={pkPass} onChange={e=> setPkPass(e.target.value)} placeholder={t('e2ee.passphrase_placeholder')||'Enter passphrase (local only; never uploaded)'} />
                  <div className="muted" style={{marginTop:6}}>{t('e2ee.passphrase_help')||'Used to encrypt/unlock your private key in the browser. Never sent to the server.'}</div>
                </div>
                <div className="item span-4">
                  <div className="label">{t('e2ee.import_priv_title')||'Import local private key'}</div>
                  <div className="cta-row">
                    <button className="btn" onClick={()=> fileInputRef.current?.click()}>{t('e2ee.import_button')||'Import key file'}</button>
                    <input ref={fileInputRef} type="file" accept="application/json" style={{display:'none'}} onChange={async (e)=>{
                      try {
                        setDecMsg('')
                        const f = e.target.files?.[0]; if (!f) return
                        const text = await f.text()
                        const obj = JSON.parse(text)
                        if (!obj || !obj.enc_priv || !obj.iv || !obj.salt || !obj.pub) throw new Error('Invalid key file')
                        localStorage.setItem('synap_pmk', JSON.stringify(obj))
                        setDecMsg(t('e2ee.import_ok')||'Key imported and stored locally. Not uploaded.')
                        e.currentTarget.value = ''
                      } catch(err:any) {
                        setDecMsg(err.message||String(err))
                      }
                    }} />
                  </div>
                  <div className="muted" style={{marginTop:6}}>{t('e2ee.import_priv_desc')||'Select the previously downloaded JSON key file. It will be stored in this browser only (never uploaded). Use your passphrase to unlock.'}</div>
                </div>
                <div className="item span-4" style={{display:'grid', gap:8}}>
                  <button className="btn" onClick={async()=>{
                    setDecMsg('')
                    try {
                      const { out, enMap, zhMap, consentCols } = await decryptCurrentBundle()
                      const outReadable = out.map((o:any)=>{
                        const a = o.answers || {}
                        const readable_en: Record<string, any> = {}
                        const readable_zh: Record<string, any> = {}
                        for (const [k, v] of Object.entries(a)) {
                          const keyEn = enMap[k] || k
                          const keyZh = zhMap[k] || k
                          readable_en[keyEn] = v
                          readable_zh[keyZh] = v
                        }
                        const consent = o.consent?.options || o.consent_options || {}
                        const consentReadableEn: Record<string, any> = {}
                        const consentReadableZh: Record<string, any> = {}
                        consentCols.forEach(col => {
                          consentReadableEn[col.en || col.key] = consent[col.key] ? 1 : 0
                          consentReadableZh[col.zh || col.en || col.key] = consent[col.key] ? 1 : 0
                        })
                        return { ...o, answers_readable_en: readable_en, answers_readable_zh: readable_zh, consent_readable_en: consentReadableEn, consent_readable_zh: consentReadableZh }
                      })
                      const blob = new Blob([outReadable.map(o=> JSON.stringify(o)).join('\n')+"\n"], { type: 'application/jsonl' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = `e2ee_${id}_plaintext.jsonl`
                      a.click(); URL.revokeObjectURL(a.href)
                      setDecMsg(t('e2ee.local_plain_ready')||'Decrypted JSONL downloaded.')
                    } catch(e:any) { setDecMsg(e.message||String(e)) }
                  }}>{t('e2ee.local_decrypt_button')||'Decrypt locally and Download JSON'}</button>
                  <button className="btn" onClick={async()=>{
                    setDecMsg('')
                    try {
                      const { out, enMap, zhMap, consentCols } = await decryptCurrentBundle()
                      // Long CSV: response_index, email, item_id, stem_en, stem_zh, value
                      const header = ['response_index','email','item_id','stem_en','stem_zh','value']
                      const lines = [header.map(csvEsc).join(',')]
                      out.forEach((o:any, idx:number)=>{
                        const email = o.email || ''
                        const a = o.answers || {}
                        for (const [k, v] of Object.entries(a)) {
                          lines.push([
                            csvEsc(idx+1),
                            csvEsc(email),
                            csvEsc(k),
                            csvEsc(enMap[k]||k),
                            csvEsc(zhMap[k]||k),
                            csvEsc(v)
                          ].join(','))
                        }
                        const consent = o.consent?.options || o.consent_options || {}
                        consentCols.forEach(col => {
                          lines.push([
                            csvEsc(idx+1),
                            csvEsc(email),
                            csvEsc(`consent.${col.key}`),
                            csvEsc(col.en || col.key),
                            csvEsc(col.zh || col.en || col.key),
                            csvEsc(consent[col.key] ? 1 : 0)
                          ].join(','))
                        })
                      })
                      const csvText = '\uFEFF' + lines.join('\r\n')+'\r\n'
                      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = `e2ee_${id}_long.csv`
                      a.click(); URL.revokeObjectURL(a.href)
                      setDecMsg(t('e2ee.local_csv_long_ready')||'Long CSV downloaded.')
                    } catch(e:any) { setDecMsg(e.message||String(e)) }
                  }}>{t('e2ee.local_decrypt_csv_long')||'Decrypt locally and Download CSV (Long)'}</button>
                  <button className="btn" onClick={async()=>{
                    setDecMsg('')
                    try {
                      const { out, enMap, consentCols } = await decryptCurrentBundle()
                      // Wide CSV (EN headers): response_index, email, ...stems_en in item order
                      const order = items.map((it:any)=> it.id)
                      const consentHeaders = consentCols.map(col=> col.en || col.zh || col.key)
                      const header = ['response_index','email', ...order.map((id:string)=> enMap[id] || id), ...consentHeaders]
                      const lines = [header.map(csvEsc).join(',')]
                      out.forEach((o:any, idx:number)=>{
                        const email = o.email || ''
                        const a = o.answers || {}
                        const consent = o.consent?.options || o.consent_options || {}
                        const row = [csvEsc(idx+1), csvEsc(email)]
                        for (const id of order) row.push(csvEsc((a as any)[id]))
                        consentCols.forEach(col=> { row.push(csvEsc(consent[col.key] ? 1 : 0)) })
                        lines.push(row.join(','))
                      })
                      const csvText = '\uFEFF' + lines.join('\r\n')+'\r\n'
                      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = `e2ee_${id}_wide_en.csv`
                      a.click(); URL.revokeObjectURL(a.href)
                      setDecMsg(t('e2ee.local_csv_wide_ready')||'Wide CSV downloaded.')
                    } catch(e:any) { setDecMsg(e.message||String(e)) }
                  }}>{t('e2ee.local_decrypt_csv_wide')||'Decrypt locally and Download CSV (Wide)'}</button>
                </div>
              </div>
              {decMsg && <div className="muted" style={{marginTop:8}}>{decMsg}</div>}
              <div className="muted" style={{marginTop:8}}>
                {t('e2ee.csv_notice')||'Note: Server-side CSV exports (long/wide/score) are available only when E2EE is OFF. When E2EE is ON, plaintext stays local; you may convert JSONL to CSV using your analysis tools.'}
                {' '}<a className="btn btn-ghost" href="https://github.com/soaringjerry/Synap/blob/main/docs/e2ee.md" target="_blank" rel="noreferrer">{t('learn_more')||'Learn more'}</a>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="row">
        <section className="card span-12">
          <h3 style={{marginTop:0, color:'#b3261e'}}>{t('danger_zone')||'Danger Zone'}</h3>
          <div className="item" style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
            <button className="btn" style={{borderColor:'#b3261e', color:'#b3261e'}} onClick={async()=>{
              if (!confirm(t('confirm_delete_responses')||'Delete ALL responses for this scale? This cannot be undone.')) return
              try { const r = await adminPurgeResponses(id); const m = `${t('deleted')||'Deleted'} ${r.removed}`; setMsg(m); toast.success(m) } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
            }}>{t('delete_all_responses')||'Delete all responses'}</button>
            <button className="btn btn-ghost" onClick={removeScale}>{t('delete')||'Delete scale'}</button>
          </div>
        </section>
      </div>
      <div className="row">
        <section className="card span-12">
          <h3 id="sec-basics" style={{marginTop:0}}>{t('manage_scale')}: <b>{id}</b></h3>
          <div className="row">
            <div className="card span-6">
              <div className="item"><div className="label">{t('name_en')}</div>
                <input className="input" value={scale.name_i18n?.en||''} onChange={e=> setScale((s:any)=> ({...s, name_i18n: {...(s.name_i18n||{}), en: e.target.value }}))} />
              </div>
              <div className="item"><div className="label">{t('name_zh')}</div>
                <input className="input" value={scale.name_i18n?.zh||''} onChange={e=> setScale((s:any)=> ({...s, name_i18n: {...(s.name_i18n||{}), zh: e.target.value }}))} />
              </div>
              <div className="item"><div className="label">Items per page</div>
                <input className="input" type="number" min={0} max={50} value={itemsPerPage} onChange={e=> setItemsPerPageState(e.target.value)} placeholder="0 = all on one page" />
              </div>
              {/* Likert Anchors moved to per-item editor */}
              <div className="item"><label><input className="checkbox" type="checkbox" checked={!!scale.randomize} onChange={e=> setScale((s:any)=> ({...s, randomize: e.target.checked}))} /> {t('randomize_items')||'Randomize items'}</label></div>
              <div className="item"><div className="label">{t('collect_email')||'Collect email'}</div>
                <select className="select" value={scale.collect_email||'optional'} onChange={e=> setScale((s:any)=> ({...s, collect_email: e.target.value }))}>
                  <option value="off">{t('collect_email_off')||'Off'}</option>
                  <option value="optional">{t('collect_email_optional')||'Optional'}</option>
                  <option value="required">{t('collect_email_required')||'Required'}</option>
                </select>
              </div>
              <div className="item"><label><input className="checkbox" type="checkbox" checked={turnstile} onChange={e=> setTurnstile(e.target.checked)} /> {t('turnstile.enable_label')||'Enable Cloudflare Turnstile (default)'}</label></div>
              <div className="cta-row" style={{marginTop:12}}>
                <button className="btn btn-primary" onClick={saveScale} disabled={saving}>{t('save')}</button>
                <button className="btn btn-ghost" onClick={removeScale}>{t('delete')}</button>
              </div>
            </div>
            <div className="card span-6">
              <h4 style={{marginTop:0}}>{t('add_item')}</h4>
                <div className="item"><div className="label">{t('stem_en')}</div>
                  <input ref={newStemEnRef} className="input" value={newStemEn} onChange={e=>setNewStemEn(e.target.value)} />
                </div>
              <div className="item"><div className="label">{t('stem_zh')}</div>
                <input className="input" value={newStemZh} onChange={e=>setNewStemZh(e.target.value)} />
              </div>
              <div className="item"><div className="label">{t('label.type')||'Type'}</div>
                <select className="select" value={newType} onChange={e=> setNewType(e.target.value as any)}>
                  <option value="likert">Likert</option>
                  <option value="single">Single choice</option>
                  <option value="multiple">Multiple choice</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="rating">Rating</option>
                  <option value="numeric">Numeric</option>
                  <option value="slider">Slider</option>
                  <option value="short_text">Short text</option>
                  <option value="long_text">Long text</option>
                  <option value="date">Date</option>
                  <option value="time">Time</option>
                </select>
              </div>
              {newType==='likert' && (
                <>
                  <div className="item"><label><input className="checkbox" type="checkbox" checked={newReverse} onChange={e=>setNewReverse(e.target.checked)} /> {t('reverse_scored')}</label></div>
                  <div className="item">
                    <div className="label">{t('label.likert_anchors_item')||'Likert Anchors (this item)'}</div>
                    <div className="cta-row" style={{marginTop:6, flexWrap:'wrap'}}>
                      <select className="select" value={likertPreset} onChange={e=> setLikertPreset(e.target.value)}>
                        <option value="numeric">{t('likert.presets.numeric')||'Numeric only'}</option>
                        <option value="agree5">{t('likert.presets.agree5')||'Agree (5‑point)'}</option>
                        <option value="freq5">{t('likert.presets.freq5')||'Frequency (5‑point)'}</option>
                        <option value="agree7">{t('likert.presets.agree7')||'Agree (7‑point)'}</option>
                        <option value="bipolar7">{t('likert.presets.bipolar7')||'Bipolar (7‑point)'}</option>
                        <option value="mono5">{t('likert.presets.mono5')||'Monopolar (5‑point)'}</option>
                      </select>
                      <button className="btn" onClick={()=>{
                        const presets: Record<string,{en:string[], zh:string[]}> = {
                          numeric: { en: [], zh: [] },
                          agree5: { en: ['Strongly disagree','Disagree','Neutral','Agree','Strongly agree'], zh: ['非常不同意','不同意','一般','同意','非常同意'] },
                          freq5: { en: ['Never','Rarely','Sometimes','Often','Always'], zh: ['从不','很少','有时','经常','总是'] },
                          agree7: { en: ['Strongly disagree','Disagree','Somewhat disagree','Neutral','Somewhat agree','Agree','Strongly agree'], zh: ['非常不同意','不同意','略不同意','中立','略同意','同意','非常同意'] },
                          bipolar7: { en: ['Very negative','Negative','Somewhat negative','Neutral','Somewhat positive','Positive','Very positive'], zh: ['非常负面','负面','略负面','中立','略正面','正面','非常正面'] },
                          mono5: { en: ['Not at all','A little','Moderate','Quite a bit','Extremely'], zh: ['完全没有','有一点','中等','相当','非常强烈'] },
                        }
                        const p = presets[likertPreset] || presets.numeric
                        setLikertLabelsEn(p.en.join(', '))
                        setLikertLabelsZh(p.zh.join('，'))
                      }}>{t('action.apply')||'Apply'}</button>
                    </div>
                    <div className="muted" style={{marginTop:6}}>{t('hint.likert_custom_labels')||'Custom labels (comma separated; length should equal Points)'}</div>
                    <div className="row">
                      <div className="card span-6"><div className="label">EN</div><input className="input" value={likertLabelsEn} onChange={e=> setLikertLabelsEn(e.target.value)} placeholder="Strongly disagree, Disagree, …" /></div>
                      <div className="card span-6"><div className="label">中文</div><input className="input" value={likertLabelsZh} onChange={e=> setLikertLabelsZh(e.target.value)} placeholder="非常不同意，…" /></div>
                    </div>
                    <label className="item" style={{display:'inline-flex',alignItems:'center',gap:8}}><input className="checkbox" type="checkbox" checked={likertShowNumbers} onChange={e=> setLikertShowNumbers(e.target.checked)} /> {t('likert.show_numbers')||'Show numbers with labels'}</label>
                    <div className="tile" style={{padding:12}}>
                      <div className="label">{t('preview')||'Preview'}</div>
                      {(() => {
                        const en = likertLabelsEn.split(/[,，]/).map(s=>s.trim()).filter(Boolean)
                        const p = en.length>0? en.length : (scale.points||5)
                        return (
                          <>
                            <div className="scale">{Array.from({length: p}, (_,i)=> i+1).map((n,i)=> <button key={n} className={`bubble ${i===Math.floor(p/2)?'active':''}`}>{likertShowNumbers? n : (en[i]||n)}</button>)}</div>
                            {(likertShowNumbers && en.length===p) && (
                              <div className="muted" style={{display:'flex',gap:8,justifyContent:'space-between',marginTop:6,flexWrap:'wrap'}}>
                                {en.map((lb,i)=> <div key={i} style={{flex:`1 1 ${Math.floor(100/Math.min(p,5))}%`,minWidth:60,fontSize:12,color:'var(--muted)'}}>{`${i+1} = ${lb}`}</div>)}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </>
              )}
              {(newType==='single'||newType==='multiple'||newType==='dropdown') && (
                <div className="item">
                  <div className="muted">{t('hint.options_lang_specific')||'Options are language-specific; one per line.'}</div>
                  <div className="row">
                    <div className="card span-6">
                      <div className="label">{t('label.options_en')||'Options (EN)'}</div>
                      <textarea className="input" rows={4} value={newOptsEn} onChange={e=> setNewOptsEn(e.target.value)} placeholder={"Yes\nNo"} />
                    </div>
                    <div className="card span-6">
                      <div className="label">{t('label.options_zh')||'Options (ZH)'}</div>
                      <textarea className="input" rows={4} value={newOptsZh} onChange={e=> setNewOptsZh(e.target.value)} placeholder={"是\n否"} />
                    </div>
                  </div>
                </div>
              )}
              {(newType==='rating'||newType==='numeric'||newType==='slider') && (
                <div className="row">
                  <div className="card span-4"><div className="label">{t('label.min')||'Min'}</div><input className="input" type="number" placeholder="0" value={newMin} onChange={e=> setNewMin(e.target.value)} /></div>
                  <div className="card span-4"><div className="label">{t('label.max')||'Max'}</div><input className="input" type="number" placeholder="10" value={newMax} onChange={e=> setNewMax(e.target.value)} /></div>
                  <div className="card span-4"><div className="label">{t('label.step')||'Step'}</div><input className="input" type="number" placeholder="1" value={newStep} onChange={e=> setNewStep(e.target.value)} /></div>
                </div>
              )}
              {(newType==='short_text'||newType==='long_text') && (
                <div className="row">
                  <div className="card span-6"><div className="label">Placeholder (EN)</div><input className="input" value={newPhEn} onChange={e=> setNewPhEn(e.target.value)} /></div>
                  <div className="card span-6"><div className="label">占位（中文）</div><input className="input" value={newPhZh} onChange={e=> setNewPhZh(e.target.value)} /></div>
                </div>
              )}
              {/* Type preview (skip for Likert; Likert has its own richer preview above) */}
              {newType !== 'likert' && (
                <div className="item">
                  <div className="label">{t('preview')||'Preview'}</div>
                  <div className="tile" style={{padding:12}}>
                    {renderNewPreview()}
                  </div>
                </div>
              )}
              <div className="item"><label><input className="checkbox" type="checkbox" checked={newRequired} onChange={e=> setNewRequired(e.target.checked)} /> Required</label></div>
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
              <div className="muted">{t('consent_md_hint')||'Markdown supported: headings, lists, links, bold/italic, code.'}</div>
              <div className="muted">{t('consent_override_hint')||'If provided, the default sections are hidden in the survey.'}</div>
              <div className="muted">{t('consent_inline_hint')||'Tip: Insert [[CONSENT]] (or <interactive-consent/> / <context/>) to place the interactive confirmations (options + signature) inline. If not present, it appears after the text.'}</div>
              <div className="cta-row" style={{marginTop:8}}>
                <button className="btn" onClick={()=>{
                  const opts = consentOptions.map((o:any)=> `<tr><td>${o.en||o.key}</td><td>${o.required? 'required':'optional'}</td></tr>`).join('')
                  const body = `<h1>Consent Preview</h1><div class=\"muted\">Version ${consentVersion||'v1'}</div><h2>Options</h2><table><thead><tr><th>Item</th><th>Mode</th></tr></thead><tbody>${opts}</tbody></table>`
                  const html = `<!doctype html><html><head><meta charset=\"utf-8\"/><title>Consent Preview</title><style>@page{margin:16mm;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans','PingFang SC','Microsoft YaHei',sans-serif;color:#111}.wrap{max-width:820px;margin:24px auto;padding:0 16px}h1{font-size:20px;margin:0 0 8px}h2{font-size:16px;margin:18px 0 8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:13px;vertical-align:top;page-break-inside:avoid}th{background:#f7f7f7;text-align:left}</style><script>window.onload=function(){setTimeout(function(){try{window.print()}catch(e){}},200)}</script></head><body><div class=\"wrap\">${body}</div></body></html>`
                  try { const blob = new Blob([html], { type:'text/html' }); const url = URL.createObjectURL(blob); const w = window.open(url, '_blank', 'noopener,noreferrer'); if (!w) { URL.revokeObjectURL(url) } setTimeout(()=> URL.revokeObjectURL(url), 60_000) } catch {}
                }}>{t('preview')||'Preview'} + {t('survey.download_consent_pdf')||'Download consent (PDF)'}</button>
              </div>
              <div className="muted">{t('consent_group_hint')||'You can set a Group number for each confirmation, then place them separately with [[CONSENT1]], [[CONSENT2]], etc. Or use [[CONSENT:options=withdrawal,data_use]] for explicit keys.'}</div>
              <div className="cta-row" style={{marginTop:8}}>
                <button className="btn" onClick={async()=>{
                  try {
                    await adminUpdateScale(id, { consent_i18n: scale.consent_i18n } as any)
                    setMsg(t('saved') as string); toast.success(t('save_success')||t('saved')||'Saved')
                  } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
                }}>{t('save')||'Save'}</button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="row" style={{marginTop:16}}>
        <section className="card span-12">
          <h3 id="sec-analytics" style={{marginTop:0}}>{t('analytics')||'Analytics'}</h3>
          {scale.e2ee_enabled && (
            <div className="tile" style={{padding:10, marginBottom:10, border:'1px solid #b36b00', background:'#fffaf0', color:'#b36b00'}}>
              {t('e2ee.analytics_notice')||'When E2EE is ON, advanced analytics (e.g., histograms, alpha) are unavailable on the server; only basic counts may be shown. Use local plaintext export for analysis.'}
            </div>
          )}
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
          <h3 id="sec-items" style={{marginTop:0}}>{t('your_items')||'Items'}</h3>
          {items.length===0 && <div className="muted">{t('no_items')||'No items yet.'}</div>}
          <div className="cta-row" style={{marginBottom:8}}>
            <button className="btn" onClick={async()=>{ try { await adminReorderItems(id, items.map((x:any)=> x.id)); setMsg(t('saved') as string); toast.success(t('save_success')||t('saved')||'Saved') } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) } }}>{t('save')||'Save'} order</button>
          </div>
          {items.map((it:any, idx:number)=> (
            <div key={it.id} className="item" style={{borderTop:'1px solid var(--border)', paddingTop:12, marginTop:8}}>
              <div className="cta-row" style={{marginBottom:6}}>
                <button className="btn btn-ghost" onClick={()=> setItems(arr=> { const a=[...arr]; if (idx<=0) return a; const t=a[idx]; a[idx]=a[idx-1]; a[idx-1]=t; return a })} disabled={idx===0}>↑</button>
                <button className="btn btn-ghost" onClick={()=> setItems(arr=> { const a=[...arr]; if (idx>=arr.length-1) return a; const t=a[idx]; a[idx]=a[idx+1]; a[idx+1]=t; return a })} disabled={idx===items.length-1}>↓</button>
              </div>
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
                    <div className="tile" style={{padding:12}}>
                      <div className="label">{t('preview')||'Preview'}</div>
                      {(() => {
                        const arrEn = ((it as any).likert_labels_i18n?.en||[]) as string[]
                        const p = arrEn.length>0? arrEn.length : (scale.points||5)
                        const showNums = !!(it as any).likert_show_numbers
                        return (
                          <>
                            <div className="scale">{Array.from({length: p}, (_,i)=> i+1).map((n,i)=> <button key={n} className={`bubble ${i===Math.floor(p/2)?'active':''}`}>{showNums? n : (arrEn[i]||n)}</button>)}</div>
                            {(showNums && arrEn.length===p) && (
                              <div className="muted" style={{display:'flex',gap:8,justifyContent:'space-between',marginTop:6,flexWrap:'wrap'}}>
                                {arrEn.map((lb,i)=> <div key={i} style={{flex:`1 1 ${Math.floor(100/Math.min(p,5))}%`,minWidth:60,fontSize:12,color:'var(--muted)'}}>{`${i+1} = ${lb}`}</div>)}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </>
              )}
              <div className="item"><label><input className="checkbox" type="checkbox" checked={!!it.required} onChange={e=> setItems(arr=> arr.map(x=> x.id===it.id? {...x, required: e.target.checked }:x))} /> Required</label></div>
              {/* Preview for existing item */}
              {((it.type||'likert')!=='likert') && (
                <div className="item">
                  <div className="label">{t('preview')||'Preview'}</div>
                  <div className="tile" style={{padding:12}}>
                    {(() => {
                      const tpe = it.type || 'likert'
                    if (tpe==='single') return (
                      <div>{(it.options_i18n?.en||['Option A','Option B']).slice(0,3).map((o:string,idx:number)=> (
                        <label key={o} style={{display:'inline-flex',gap:6,marginRight:12,alignItems:'center'}}>
                          <input className="radio" type="radio" checked={idx===0} readOnly /> {o}
                        </label>
                      ))}</div>
                    )
                    if (tpe==='multiple') return (
                      <div>{(it.options_i18n?.en||['Option A','Option B']).slice(0,3).map((o:string,idx:number)=> (
                        <label key={o} style={{display:'inline-flex',gap:6,marginRight:12,alignItems:'center'}}>
                          <input className="checkbox" type="checkbox" checked={idx===0} readOnly /> {o}
                        </label>
                      ))}</div>
                    )
                    if (tpe==='dropdown') return (
                      <select className="select" defaultValue={(it.options_i18n?.en||['Option A'])[0]}>{(it.options_i18n?.en||['Option A']).slice(0,3).map((o:string)=> <option key={o} value={o}>{o}</option>)}</select>
                    )
                    if (tpe==='rating') return (
                      <div className="scale">{Array.from({length: (it.max||10)-(it.min||0)+1}, (_,i)=> (it.min||0)+i).map((n:number)=> <button key={n} className={`bubble ${n===(it.min||0)+2?'active':''}`}>{n}</button>)}</div>
                    )
                    if (tpe==='numeric') return (
                      <input className="input" type="number" min={it.min||0} max={it.max||10} step={it.step||1} defaultValue={it.min||0} readOnly />
                    )
                    if (tpe==='slider') return (
                      <input className="input" type="range" min={it.min||0} max={it.max||100} step={it.step||1} defaultValue={(it.min||0)+Math.floor(((it.max||100)-(it.min||0))/2)} readOnly />
                    )
                    if (tpe==='short_text') return <input className="input" type="text" placeholder={it.placeholder_i18n?.en||'Short answer...'} readOnly />
                    if (tpe==='long_text') return <textarea className="input" rows={4} placeholder={it.placeholder_i18n?.en||'Long answer...'} readOnly />
                    if (tpe==='date') return <input className="input" type="date" readOnly />
                    if (tpe==='time') return <input className="input" type="time" readOnly />
                    return null
                    })()}
                  </div>
                </div>
              )}
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
