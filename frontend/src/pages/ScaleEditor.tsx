import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

// Standalone components (avoid nested hooks inside conditional renders)
function ExportPanel({ scale, items }: { scale: any; items: any[] }) {
  const { t } = useTranslation()
  const { id='' } = useParams()
  const isE2EE = !!scale?.e2ee_enabled
  const [pkPass, setPkPass] = useState('')
  const [status, setStatus] = useState('')

  function fromB64(s: string) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out }
  function csvEsc(v: any): string { const s = v==null ? '' : (Array.isArray(v)? v.join(', ') : (typeof v==='object'? JSON.stringify(v) : String(v))); return '"'+s.replace(/"/g,'""')+'"' }
  async function unlockLocalPriv(): Promise<Uint8Array> {
    const blobStr = localStorage.getItem('synap_pmk'); if (!blobStr) throw new Error(t('e2ee.import_required'))
    if (!pkPass) throw new Error(t('e2ee.passphrase_needed'))
    const blob = JSON.parse(blobStr)
    const salt = fromB64(blob.salt); const iv = fromB64(blob.iv); const enc = fromB64(blob.enc_priv)
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pkPass), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt, iterations:120000, hash:'SHA-256' }, keyMaterial, { name:'AES-GCM', length:256 }, false, ['decrypt'])
    const priv = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, enc)
    return new Uint8Array(priv)
  }
  async function decryptCurrentBundle(): Promise<{ out:any[]; enMap: Record<string,string>; zhMap: Record<string,string>; consentCols: { key:string; en:string; zh:string }[] }>{
    if (!scale) throw new Error('No scale loaded')
    const exp = await adminCreateE2EEExport(id)
    const bundle:any = await (await fetch(exp.url)).json()
    const entries:any[] = bundle.entries || bundle.responses || []
    const priv = await unlockLocalPriv()
    const privB64 = btoa(String.fromCharCode(...priv))
    const out:any[] = []
    const enMap:Record<string,string> = {}; const zhMap:Record<string,string> = {}
    for (const it of items) { enMap[it.id] = it.stem_i18n?.en || it.stem || it.id; zhMap[it.id] = it.stem_i18n?.zh || it.stem_i18n?.en || it.stem || it.id }
    for (const entry of entries) {
      try {
        const plain = await decryptSingleWithX25519(privB64, { ciphertext: entry.ciphertext, nonce: entry.nonce, enc_dek: entry.enc_dek || entry.EncDEK || [] })
        out.push(plain)
      } catch {}
    }
    if (out.length===0) throw new Error(t('e2ee.no_decrypted'))
    const consentOpts = Array.isArray(scale?.consent_config?.options) ? scale.consent_config.options : []
    const consentCols = consentOpts.map((opt:any) => {
      const fbEn = t(`survey.consent_opt.${opt.key}`, { lng: 'en' }) as string
      const fbZh = t(`survey.consent_opt.${opt.key}`, { lng: 'zh' }) as string
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
  if (isE2EE) {
    return (
      <>
        <h4 className="section-title" style={{marginTop:0}}>{t('e2ee.export_title')}</h4>
        <div className="muted" style={{marginBottom:8}}>{t('e2ee.local_export_desc')}</div>
        <div className="row" style={{marginTop:8}}>
          <div className="card span-12">
            <div className="item"><div className="label">{t('e2ee.passphrase')}</div><input className="input" type="password" value={pkPass} onChange={e=> setPkPass(e.target.value)} placeholder={t('e2ee.passphrase_placeholder')||''} /></div>
            <div className="cta-row" style={{marginTop:8, gap:8, flexWrap:'wrap'}}>
              <button className="btn" type="button" onClick={async()=>{
                try { setStatus(''); const { out } = await decryptCurrentBundle(); const lines = out.map((x:any)=> JSON.stringify(x)); const blob = new Blob([lines.join('\n')+'\n'], { type:'application/jsonl' }); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`e2ee_${id}.jsonl`; a.click(); URL.revokeObjectURL(a.href); setStatus(t('e2ee.local_plain_ready')) } catch(err:any) { setStatus(err.message||String(err)) }
              }}>{t('e2ee.local_decrypt_button')}</button>
              <button className="btn" type="button" onClick={async()=>{
                try { setStatus(''); const { out, zhMap, consentCols } = await decryptCurrentBundle(); const order = items.map((it:any)=> it.id); const consentHeaders = consentCols.map(col=> col.zh || col.en || col.key); const header = ['response_index','email', ...order.map(key=> zhMap[key] || key), ...consentHeaders]; const lines = [header.map(csvEsc).join(',')]; out.forEach((entry:any, idx:number)=>{ const answers = entry.answers || {}; const email = entry.email || ''; const consent = entry.consent?.options || entry.consent_options || {}; const row = [csvEsc(idx+1), csvEsc(email)]; for (const key of order) row.push(csvEsc((answers as any)[key])); consentCols.forEach(col=> { row.push(csvEsc(consent[col.key] ? 1 : 0)) }); lines.push(row.join(',')) }); const csvText = '\uFEFF' + lines.join('\r\n') + '\r\n'; const blob = new Blob([csvText], { type:'text/csv;charset=utf-8' }); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`e2ee_${id}_long.csv`; a.click(); URL.revokeObjectURL(a.href); setStatus(t('e2ee.local_csv_long_ready')) } catch(err:any) { setStatus(err.message||String(err)) }
              }}>{t('e2ee.local_decrypt_csv_long')}</button>
              <button className="btn" type="button" onClick={async()=>{
                try { setStatus(''); const { out, enMap, consentCols } = await decryptCurrentBundle(); const order = items.map((it:any)=> it.id); const consentHeaders = consentCols.map(col=> col.en || col.zh || col.key); const header = ['response_index','email', ...order.map(key=> enMap[key] || key), ...consentHeaders]; const lines = [header.map(csvEsc).join(',')]; out.forEach((entry:any, idx:number)=>{ const answers = entry.answers || {}; const email = entry.email || ''; const consent = entry.consent?.options || entry.consent_options || {}; const row = [csvEsc(idx+1), csvEsc(email)]; for (const key of order) row.push(csvEsc((answers as any)[key])); consentCols.forEach(col=> { row.push(csvEsc(consent[col.key] ? 1 : 0)) }); lines.push(row.join(',')) }); const csvText = '\uFEFF' + lines.join('\r\n') + '\r\n'; const blob = new Blob([csvText], { type:'text/csv;charset=utf-8' }); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`e2ee_${id}_wide_en.csv`; a.click(); URL.revokeObjectURL(a.href); setStatus(t('e2ee.local_csv_wide_ready')) } catch(err:any) { setStatus(err.message||String(err)) }
              }}>{t('e2ee.local_decrypt_csv_wide')}</button>
            </div>
            {status && <div className="muted" style={{marginTop:8}}>{status}</div>}
            <div className="muted" style={{marginTop:8}}>
              {t('e2ee.csv_notice')} <a className="btn btn-ghost" href="https://github.com/soaringjerry/Synap/blob/main/docs/e2ee.md" target="_blank" rel="noreferrer">{t('learn_more')}</a>
            </div>
          </div>
        </div>
      </>
    )
  }
  return (
    <>
      <h4 className="section-title" style={{marginTop:0}}>{t('export')}</h4>
      <div className="muted" style={{marginBottom:8}}>{t('export_panel.csv_bom_hint')}</div>
      <div className="cta-row" style={{marginTop:12}}>
        <a className="neon-btn" href={`/api/export?format=long&scale_id=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">{t('export_long_csv')}</a>
        <a className="neon-btn" href={`/api/export?format=wide&scale_id=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">{t('export_wide_csv')}</a>
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

type View = 'editor' | 'settings' | 'share'

type SettingsViewProps = {
  scale: any | null
  scaleId: string
  items: any[]
  onScaleUpdated: React.Dispatch<React.SetStateAction<any>>
  likertDefaults: { en: string; zh: string; showNumbers: boolean; preset: string }
  onLikertDefaultsSaved: (defaults: { en: string; zh: string; showNumbers: boolean; preset: string }) => void
  onReload: () => Promise<void>
}

const SettingsView = React.memo(function SettingsView({
  scale,
  scaleId,
  items,
  onScaleUpdated,
  likertDefaults,
  onLikertDefaultsSaved,
  onReload,
}: SettingsViewProps) {
  const { t, i18n } = useTranslation()
  const toast = useToast()

  const [localNameEn, setLocalNameEn] = useState('')
  const [localNameZh, setLocalNameZh] = useState('')
  const [localCollectEmail, setLocalCollectEmail] = useState<'off'|'optional'|'required'>('off')
  const [localRegion, setLocalRegion] = useState('auto')
  const [localTurnstile, setLocalTurnstile] = useState(false)
  const [localItemsPerPage, setLocalItemsPerPage] = useState('0')
  const [localLikertPreset, setLocalLikertPreset] = useState(likertDefaults.preset)
  const [localLikertLabelsEn, setLocalLikertLabelsEn] = useState(likertDefaults.en)
  const [localLikertLabelsZh, setLocalLikertLabelsZh] = useState(likertDefaults.zh)
  const [localLikertShowNumbers, setLocalLikertShowNumbers] = useState(likertDefaults.showNumbers)
  const [localConsentVersion, setLocalConsentVersion] = useState('v1')
  const [localSignatureRequired, setLocalSignatureRequired] = useState(true)
  const [localConsentOptions, setLocalConsentOptions] = useState<{ key:string; required:boolean; en?:string; zh?:string; group?: number }[]>([])
  const [localConsentEn, setLocalConsentEn] = useState('')
  const [localConsentZh, setLocalConsentZh] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [aiTargets, setAiTargets] = useState('zh')
  const [aiPreview, setAiPreview] = useState<any|null>(null)
  const [aiMsg, setAiMsg] = useState('')
  const [aiReady, setAiReady] = useState(false)
  const [aiWorking, setAiWorking] = useState(false)
  const [aiInclude, setAiInclude] = useState<Record<string, boolean>>({})
  const [aiApplying, setAiApplying] = useState(false)

  useEffect(() => {
    if (!scale) return
    setLocalNameEn(scale.name_i18n?.en || '')
    setLocalNameZh(scale.name_i18n?.zh || '')
    setLocalCollectEmail((scale.collect_email as 'off'|'optional'|'required') || 'off')
    setLocalRegion(scale.region || 'auto')
    setLocalTurnstile(!!scale.turnstile_enabled)
    setLocalItemsPerPage(String(scale.items_per_page ?? 0))
    const labs = (scale.likert_labels_i18n || {}) as Record<string, string[]>
    setLocalLikertLabelsEn((labs.en || []).join(', '))
    setLocalLikertLabelsZh((labs.zh || []).join('，'))
    setLocalLikertShowNumbers(!!scale.likert_show_numbers)
    setLocalLikertPreset(scale.likert_preset || likertDefaults.preset || 'numeric')
    const cc = scale.consent_config || {}
    setLocalConsentVersion(cc.version || 'v1')
    setLocalSignatureRequired(!!(cc.signature_required ?? true))
    setLocalConsentOptions((cc.options || []).map((o:any) => {
      let group: number | undefined
      if (typeof o.group === 'number') {
        group = o.group
      } else if (typeof o.group === 'string' && o.group.trim() !== '') {
        const parsed = Number(o.group)
        if (!Number.isNaN(parsed)) group = parsed
      }
      return { key: o.key, required: !!o.required, en: o.label_i18n?.en, zh: o.label_i18n?.zh, group }
    }))
    setLocalConsentEn(scale.consent_i18n?.en || '')
    setLocalConsentZh(scale.consent_i18n?.zh || '')
    setAdvancedOpen(false)
    setAiTargets('zh')
    setAiPreview(null)
    setAiMsg('')
    setAiInclude({})
  }, [scale?.id, likertDefaults.preset])

  useEffect(() => {
    let canceled = false
    const run = async () => {
      try {
        const cfg = await adminGetAIConfig()
        if (!canceled) setAiReady(!!cfg.openai_key && !!cfg.allow_external)
      } catch {
        if (!canceled) setAiReady(false)
      }
    }
    run()
    return () => { canceled = true }
  }, [scaleId])

  const getOpt = useCallback((key: string) => localConsentOptions.find(o => o.key === key), [localConsentOptions])

  const setOptMode = useCallback((key: string, mode: 'off'|'optional'|'required') => {
    setLocalConsentOptions(list => {
      if (mode === 'off') return list.filter(o => o.key !== key)
      const idx = list.findIndex(o => o.key === key)
      if (idx === -1) {
        const enLabel = i18n.t(`survey.consent_opt.${key}` as const, { lng: 'en' })
        const zhLabel = i18n.t(`survey.consent_opt.${key}` as const, { lng: 'zh' })
        return [...list, {
          key,
          required: mode === 'required',
          en: enLabel !== `survey.consent_opt.${key}` ? enLabel : undefined,
          zh: zhLabel !== `survey.consent_opt.${key}` ? zhLabel : undefined,
        }]
      }
      const next = [...list]
      next[idx] = { ...next[idx], required: mode === 'required' }
      return next
    })
  }, [i18n])

  const saveScale = useCallback(async () => {
    if (!scale) return
    try {
      const labsEn = localLikertLabelsEn.split(/[,，]/).map(s => s.trim()).filter(Boolean)
      const labsZh = localLikertLabelsZh.split(/[,，]/).map(s => s.trim()).filter(Boolean)
      const likert_labels_i18n: Record<string, string[]> = {}
      if (labsEn.length) likert_labels_i18n.en = labsEn
      if (labsZh.length) likert_labels_i18n.zh = labsZh
      const parsedIpp = parseInt(localItemsPerPage || '0', 10)
      const itemsPerPageNumber = Number.isNaN(parsedIpp) ? 0 : parsedIpp
      await adminUpdateScale(scaleId, {
        name_i18n: { ...(scale.name_i18n || {}), en: localNameEn, zh: localNameZh },
        randomize: !!scale.randomize,
        consent_i18n: scale.consent_i18n,
        collect_email: localCollectEmail,
        e2ee_enabled: !!scale.e2ee_enabled,
        region: localRegion,
        items_per_page: itemsPerPageNumber,
        turnstile_enabled: !!localTurnstile,
        likert_labels_i18n,
        likert_show_numbers: !!localLikertShowNumbers,
        likert_preset: localLikertPreset,
      } as any)
      onScaleUpdated((prev: any) => {
        if (!prev) return prev
        return {
          ...prev,
          name_i18n: { ...(prev.name_i18n || {}), en: localNameEn, zh: localNameZh },
          collect_email: localCollectEmail,
          region: localRegion,
          turnstile_enabled: !!localTurnstile,
          items_per_page: itemsPerPageNumber,
          likert_labels_i18n,
          likert_show_numbers: !!localLikertShowNumbers,
          likert_preset: localLikertPreset,
        }
      })
      onLikertDefaultsSaved({
        en: localLikertLabelsEn,
        zh: localLikertLabelsZh,
        showNumbers: localLikertShowNumbers,
        preset: localLikertPreset,
      })
      toast.success(t('save_success'))
    } catch (e:any) {
      toast.error(e.message || String(e))
    }
  }, [localLikertLabelsEn, localLikertLabelsZh, scale, scaleId, localCollectEmail, localRegion, localTurnstile, localItemsPerPage, localLikertShowNumbers, localLikertPreset, localNameEn, localNameZh, onScaleUpdated, onLikertDefaultsSaved, t, toast])

  const saveConsentConfig = useCallback(async () => {
    if (!scale) return
    try {
      const keys = localConsentOptions.map(o => o.key.trim())
      const hasEmpty = keys.some(k => !k)
      const dup = keys.find((k, idx) => k && keys.indexOf(k) !== idx)
      if (hasEmpty || dup) {
        toast.error(t('consent.advanced.save_first_error'))
        return
      }
      const optionsPayload = localConsentOptions.map(o => {
        const trimmedKey = o.key.trim()
        const trimmedEn = o.en?.trim() || ''
        const trimmedZh = o.zh?.trim() || ''
        const opt: any = { key: trimmedKey, required: !!o.required }
        if (trimmedEn || trimmedZh) {
          opt.label_i18n = {
            ...(trimmedEn ? { en: trimmedEn } : {}),
            ...(trimmedZh ? { zh: trimmedZh } : {}),
          }
        }
        if (typeof o.group === 'number' && !Number.isNaN(o.group)) {
          opt.group = o.group
        }
        return opt
      })
      const consentText = {
        en: localConsentEn.trim() ? localConsentEn : undefined,
        zh: localConsentZh.trim() ? localConsentZh : undefined,
      }
      await adminUpdateScale(scaleId, {
        consent_i18n: consentText,
        consent_config: {
          version: localConsentVersion || 'v1',
          options: optionsPayload,
          signature_required: !!localSignatureRequired,
        },
      } as any)
      onScaleUpdated((prev: any) => {
        if (!prev) return prev
        const nextConsent: any = { ...(prev.consent_i18n || {}) }
        if (consentText.en === undefined) delete nextConsent.en
        else nextConsent.en = consentText.en
        if (consentText.zh === undefined) delete nextConsent.zh
        else nextConsent.zh = consentText.zh
        return {
          ...prev,
          consent_i18n: nextConsent,
          consent_config: {
            version: localConsentVersion || 'v1',
            signature_required: !!localSignatureRequired,
            options: optionsPayload,
          },
        }
      })
      toast.success(t('save_success'))
    } catch (e:any) {
      toast.error(e.message || String(e))
    }
  }, [localConsentOptions, localConsentEn, localConsentZh, localConsentVersion, localSignatureRequired, scale, scaleId, onScaleUpdated, t, toast])

  const AdvancedConsent = ({ open }: { open: boolean }) => {
    const moveRow = (idx: number, delta: number) => {
      if (!delta) return
      setLocalConsentOptions(list => {
        const next = [...list]
        const target = idx + delta
        if (target < 0 || target >= next.length) return next
        const tmp = next[idx]
        next[idx] = next[target]
        next[target] = tmp
        return next
      })
    }
    const removeRow = (idx: number) => setLocalConsentOptions(list => list.filter((_, i) => i !== idx))
    return (
      <>
        <button type="button" className="btn btn-ghost" onClick={()=> setAdvancedOpen(o=> !o)}>{open? t('consent.hide_advanced') : t('consent.show_advanced')}</button>
        {open && (
          <div className="tile" style={{padding:16, marginTop:8}}>
            <div className="row">
              <div className="card span-6">
                <div className="label">{t('consent_en')}</div>
                <textarea className="input" rows={4} value={localConsentEn} onChange={e=> setLocalConsentEn(e.target.value)} placeholder={t('consent_hint') as string} />
              </div>
              <div className="card span-6">
                <div className="label">{t('consent_zh')}</div>
                <textarea className="input" rows={4} value={localConsentZh} onChange={e=> setLocalConsentZh(e.target.value)} placeholder={t('consent_hint') as string} />
              </div>
            </div>
            <div className="muted" style={{marginTop:8}}>{t('consent.inline_hint')}</div>
            <div className="muted" style={{marginBottom:12}}>{t('consent.group_hint')}</div>
            <div className="muted" style={{marginBottom:12}}>{t('consent_md_hint')}</div>
            <table className="consent-table">
              <thead>
                <tr>
                  <th>{t('consent.advanced.label_en')}</th>
                  <th>{t('consent.advanced.label_zh')}</th>
                  <th>{t('consent.advanced.group')}</th>
                  <th>{t('consent.advanced.required')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {localConsentOptions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">{t('consent.advanced.empty')}</td>
                  </tr>
                )}
                {localConsentOptions.map((o, idx) => (
                  <tr key={o.key || idx}>
                    <td data-label={t('consent.advanced.label_en')}><input className="input" value={o.en||''} onChange={e=> setLocalConsentOptions(list=> list.map((x,i)=> i===idx? {...x, en: e.target.value}:x))} placeholder={t('optional')} /></td>
                    <td data-label={t('consent.advanced.label_zh')}><input className="input" value={o.zh||''} onChange={e=> setLocalConsentOptions(list=> list.map((x,i)=> i===idx? {...x, zh: e.target.value}:x))} placeholder={t('optional')} /></td>
                    <td data-label={t('consent.advanced.group')}><input className="input" type="number" value={o.group ?? ''} onChange={e=> {
                      const raw = e.target.value
                      setLocalConsentOptions(list=> list.map((x,i)=> {
                        if (i !== idx) return x
                        if (raw === '') return { ...x, group: undefined }
                        const parsed = parseInt(raw, 10)
                        if (Number.isNaN(parsed)) return { ...x, group: undefined }
                        return { ...x, group: parsed }
                      }))
                    }} placeholder={t('optional')} /></td>
                    <td data-label={t('consent.advanced.required')}><label style={{display:'inline-flex',alignItems:'center',gap:6}}><input className="checkbox" type="checkbox" checked={o.required} onChange={e=> setLocalConsentOptions(list=> list.map((x,i)=> i===idx? {...x, required: e.target.checked}:x))} />{t('required')}</label></td>
                    <td data-label={t('actions')}>
                      <div className="consent-table-actions">
                        <button type="button" className="btn btn-ghost" onClick={()=> removeRow(idx)}>{t('delete')}</button>
                        <button type="button" className="btn btn-ghost" disabled={idx===0} onClick={()=> moveRow(idx, -1)}>↑</button>
                        <button type="button" className="btn btn-ghost" disabled={idx===localConsentOptions.length-1} onClick={()=> moveRow(idx, 1)}>↓</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="cta-row" style={{marginTop:12, justifyContent:'flex-end'}}>
              <button className="btn" type="button" onClick={()=> setLocalConsentOptions(list=> [...list, { key:`custom_${Date.now()}_${Math.floor(Math.random()*1_000)}`, required:false }])}>{t('consent.advanced.add_option')}</button>
              <button className="btn btn-primary" type="button" onClick={saveConsentConfig}>{t('save')}</button>
            </div>
          </div>
        )}
      </>
    )
  }

  if (!scale) return null

  return (
    <>
      <div className="row">
        <div className="card span-6">
          <h4 className="section-title" style={{marginTop:0}}>{t('editor.basic_info')}</h4>
          <div className="item"><div className="label">{t('name_en')}</div><input className="input" value={localNameEn} onChange={e=> setLocalNameEn(e.target.value)} /></div>
          <div className="item"><div className="label">{t('name_zh')}</div><input className="input" value={localNameZh} onChange={e=> setLocalNameZh(e.target.value)} /></div>
          <div className="item">
            <div className="label">{t('likert.defaults')}</div>
            <div className="muted" style={{marginBottom:6}}>{t('likert.presets.title')}</div>
            <select className="select" value={localLikertPreset} onChange={e=> {
              const value = e.target.value
              setLocalLikertPreset(value)
              if (!value) return
              const preset = LIKERT_PRESETS[value]
              if (!preset) return
              setLocalLikertLabelsEn(preset.en.join(', '))
              setLocalLikertLabelsZh(preset.zh.join('，'))
            }}>
              <option value="">{t('likert.presets.custom')}</option>
              {Object.keys(LIKERT_PRESETS).map(key => (
                <option key={key} value={key}>{t(`likert.presets.${key}`)}</option>
              ))}
            </select>
            <div className="row" style={{marginTop:8}}>
              <div className="card span-6"><div className="label">{t('lang_en')}</div><input className="input" value={localLikertLabelsEn} onChange={e=> setLocalLikertLabelsEn(e.target.value)} placeholder={t('hint.likert_anchors_en')} /></div>
              <div className="card span-6"><div className="label">{t('lang_zh')}</div><input className="input" value={localLikertLabelsZh} onChange={e=> setLocalLikertLabelsZh(e.target.value)} placeholder={t('hint.likert_anchors_zh')} /></div>
            </div>
            <label className="item" style={{display:'inline-flex',alignItems:'center',gap:8, marginTop:6}}>
              <input className="checkbox" type="checkbox" checked={localLikertShowNumbers} onChange={e=> setLocalLikertShowNumbers(e.target.checked)} /> {t('likert.show_numbers')}
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
            <select className="select" value={localCollectEmail} onChange={e=> setLocalCollectEmail(e.target.value as 'off'|'optional'|'required')}>
              <option value="off">{t('collect_email_off')}</option>
              <option value="optional">{t('collect_email_optional')}</option>
              <option value="required">{t('collect_email_required')}</option>
            </select>
          </div>
          <label className="item" style={{display:'flex',alignItems:'center',gap:8}} title={t('e2ee.locked_after_creation')}>
            <input className="checkbox" type="checkbox" checked={!!scale.e2ee_enabled} disabled /> {t('e2ee.title')}
          </label>
          <div className="muted" style={{marginTop:-4, marginBottom:8}}>{t('e2ee.locked_after_creation')}</div>
          <div className="item"><div className="label">{t('region')}</div>
            <select className="select" value={localRegion} onChange={e=> setLocalRegion(e.target.value)}>
              {['auto','gdpr','pipl','pdpa','ccpa'].map(r=> <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <label className="item" style={{display:'flex',alignItems:'center',gap:8}}>
            <input className="checkbox" type="checkbox" checked={localTurnstile} onChange={e=> setLocalTurnstile(e.target.checked)} /> {t('turnstile.enable_label')}
          </label>
          <div className="item"><div className="label">{t('editor.items_per_page')}</div><input className="input" type="number" value={localItemsPerPage} onChange={e=> setLocalItemsPerPage(e.target.value)} /></div>
          <div className="cta-row" style={{marginTop:8}}>
            <button type="button" className="btn btn-primary" onClick={saveScale}>{t('save')}</button>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="card span-12">
          <h4 className="section-title" style={{marginTop:0}}>{t('consent_settings')}</h4>
          <div className="row">
            <div className="card span-3"><div className="label">{t('label.version')}</div><input className="input" value={localConsentVersion} onChange={e=> setLocalConsentVersion(e.target.value)} /></div>
            <div className="card span-3"><div className="label">{t('label.signature')}</div><label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={localSignatureRequired} onChange={e=> setLocalSignatureRequired(e.target.checked)} /> {t('consent.require_signature')}</label></div>
          </div>
          <div className="tile" style={{padding:10, marginBottom:8}}>
            <div className="muted" style={{marginBottom:6}}>{t('consent.presets_title')}</div>
            <div className="cta-row">
              <button type="button" className="btn" onClick={()=> setLocalConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:false}])}>{t('consent.preset_min')}</button>
              <button type="button" className="btn" onClick={()=> { setLocalConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:false}]); setLocalSignatureRequired(true) }}>{t('consent.preset_rec')}</button>
              <button type="button" className="btn" onClick={()=> { setLocalConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:true}]); setLocalSignatureRequired(true) }}>{t('consent.preset_strict')}</button>
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
              <AdvancedConsent open={advancedOpen}/>
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
                const res = await adminAITranslatePreview(scaleId, langs)
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
              {Object.entries(aiPreview.name_i18n || {}).length > 0 && (
                <div className="item" style={{display:'grid', gap:6}}>
                  <div className="label">{t('create_scale')}</div>
                  <div className="row" style={{gap:8}}>
                    {Object.entries(aiPreview.name_i18n).map(([lang, value]) => (
                      <div key={lang} className="card span-6" style={{minWidth:200}}>
                        <div className="label">{lang}</div>
                        <textarea className="input" rows={2} defaultValue={value as string} onChange={e=> {
                          const next = e.target.value
                          setAiPreview((prev: any) => ({
                            ...prev,
                            name_i18n: { ...(prev?.name_i18n || {}), [lang]: next }
                          }))
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Object.entries(aiPreview.consent_i18n || {}).length > 0 && (
                <div className="item" style={{display:'grid', gap:6}}>
                  <div className="label">{t('consent_settings')}</div>
                  <div className="row" style={{gap:8}}>
                    {Object.entries(aiPreview.consent_i18n).map(([lang, value]) => (
                      <div key={lang} className="card span-6" style={{minWidth:200}}>
                        <div className="label">{lang}</div>
                        <textarea className="input" rows={3} defaultValue={value as string} onChange={e=> {
                          const next = e.target.value
                          setAiPreview((prev: any) => ({
                            ...prev,
                            consent_i18n: { ...(prev?.consent_i18n || {}), [lang]: next }
                          }))
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="muted" style={{marginBottom:8}}>{t('editor.your_items')}</div>
              {items.map(it => {
                const previewForItem = (aiPreview.items || {})[it.id] || {}
                if (Object.keys(previewForItem).length === 0) return null
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
                      await adminUpdateScale(scaleId, scaleUpdates)
                    }
                    toast.success(t('save_success'))
                    setAiPreview(null)
                    await onReload()
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
      </div>
      <DangerZone scaleId={scale.id} />
    </>
  )
})

function ExistingScaleEditor({ id }: { id: string }) {
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
  const newStemEnRef = useRef<HTMLInputElement | null>(null)
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

  // Share & analytics
  const [analytics, setAnalytics] = useState<any | null>(null)

  const load = useCallback(async () => {
    setMsg('')
    try {
      const s = await adminGetScale(id)
      const its = await adminGetScaleItems(id)
      setScale(s)
      setItems(its.items || [])
      const labs = (s as any).likert_labels_i18n || {}
      setLikertLabelsEn((labs.en || []).join(', '))
      setLikertLabelsZh((labs.zh || []).join('，'))
      setLikertShowNumbers(!!(s as any).likert_show_numbers)
      setLikertPreset((s as any).likert_preset || 'numeric')
      try { const a = await adminAnalyticsSummary(id); setAnalytics(a) } catch {}
    } catch (e:any) { setMsg(e.message || String(e)) }
  }, [id])

  useEffect(() => { load() }, [load])

  const likertDefaults = useMemo(() => ({
    en: likertLabelsEn,
    zh: likertLabelsZh,
    showNumbers: likertShowNumbers,
    preset: likertPreset,
  }), [likertLabelsEn, likertLabelsZh, likertShowNumbers, likertPreset])

  useEffect(() => {
    if (!newOpen) return
    const el = newStemEnRef.current
    if (!el) return
    const pos = el.value.length
    el.focus()
    try { el.setSelectionRange(pos, pos) } catch {}
  }, [newOpen, newStemEn])

  const handleLikertDefaultsSaved = useCallback((next: { en: string; zh: string; showNumbers: boolean; preset: string }) => {
    setLikertLabelsEn(next.en)
    setLikertLabelsZh(next.zh)
    setLikertShowNumbers(next.showNumbers)
    setLikertPreset(next.preset)
  }, [])

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
  const renderItemsList = () => (
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

  const renderItemEditor = () => {
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
            <div className="item span-6"><div className="label">{t('stem_en')}</div><input ref={newStemEnRef} className="input" value={newStemEn} onChange={e=> setNewStemEn(e.target.value)} /></div>
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
                {scale?.e2ee_enabled ? (
                  <div className="item stat-row"><div className="label">{t('total_responses')}</div><div className="muted">{t('e2ee.analytics_total_unavailable')}</div></div>
                ) : (
                  <div className="item stat-row"><div className="label">{t('total_responses')}</div><div>{analytics.total_responses || 0}</div></div>
                )}
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
        <div className="row">
          <div className="card span-12">
            <ExportPanel scale={scale} items={items}/>
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
          {renderItemsList()}
          {renderItemEditor()}
        </div>
      )}

      {activeView==='settings' && (
        <SettingsView
          scale={scale}
          scaleId={id}
          items={items}
          onScaleUpdated={setScale}
          likertDefaults={likertDefaults}
          onLikertDefaultsSaved={handleLikertDefaultsSaved}
          onReload={load}
        />
      )}

      {activeView==='share' && (
        <ShareView scale={scale}/>
      )}

      {msg && <div className="muted" style={{marginTop:12}}>{msg}</div>}
    </div>
  )
}

// (removed duplicate inline ExportPanel & DangerZone; see top-level versions)

const LIKERT_PRESETS: Record<string, { en: string[]; zh: string[] }> = {
  numeric: { en: ['1','2','3','4','5'], zh: ['1','2','3','4','5'] },
  agree5: { en: ['Strongly disagree','Disagree','Neutral','Agree','Strongly agree'], zh: ['非常不同意','不同意','中立','同意','非常同意'] },
  freq5: { en: ['Never','Rarely','Sometimes','Often','Always'], zh: ['从不','很少','有时','经常','总是'] },
  agree7: { en: ['Strongly disagree','Disagree','Somewhat disagree','Neutral','Somewhat agree','Agree','Strongly agree'], zh: ['非常不同意','不同意','有点不同意','中立','有点同意','同意','非常同意'] },
  bipolar7: { en: ['Extremely negative','Very negative','Slightly negative','Neutral','Slightly positive','Very positive','Extremely positive'], zh: ['非常负向','很负向','略为负向','中立','略为正向','很正向','非常正向'] },
  mono5: { en: ['Not at all','Slightly','Moderately','Very','Extremely'], zh: ['完全没有','稍微','中等','非常','极其'] },
}

export function ScaleEditor() {
  const { id = '' } = useParams()
  return <ExistingScaleEditor id={id} />
}

export default ScaleEditor
