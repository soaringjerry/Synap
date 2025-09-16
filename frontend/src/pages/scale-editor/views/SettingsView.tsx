import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../components/Toast'
import {
  adminAITranslatePreview,
  adminGetAIConfig,
  adminUpdateItem,
  adminUpdateScale,
} from '../../../api/client'
import DangerZone from '../components/DangerZone'
import { LIKERT_PRESETS } from '../constants'
import { useScaleEditor } from '../ScaleEditorContext'

type SettingsViewProps = {
  scale: any | null
  scaleId: string
  items: any[]
  onScaleUpdated: React.Dispatch<React.SetStateAction<any>>
  likertDefaults: { en: string; zh: string; showNumbers: boolean; preset: string }
  onLikertDefaultsSaved: (defaults: { en: string; zh: string; showNumbers: boolean; preset: string }) => void
  onReload: () => Promise<void>
}

const InternalSettingsView = React.memo(function SettingsView({
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
        <div className="card span-6">
          <h4 className="section-title" style={{marginTop:0}}>{t('consent_settings')}</h4>
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
        </div>
        <div className="card span-6">
          <h4 className="section-title" style={{marginTop:0}}>{t('ai.preview_title')}</h4>
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
      <DangerZone />
    </>
  )
})

const SettingsViewWrapper: React.FC = () => {
  const { state, dispatch, scaleId, reload } = useScaleEditor()
  const handleScaleUpdated = useCallback<React.Dispatch<React.SetStateAction<any>>>(
    updater => {
      dispatch({
        type: 'setScale',
        scale: typeof updater === 'function' ? (updater as (prev: any) => any)(state.scale) : updater,
      })
    },
    [dispatch, state.scale],
  )

  const handleLikertDefaultsSaved = useCallback((defaults: { en: string; zh: string; showNumbers: boolean; preset: string }) => {
    dispatch({ type: 'setLikertDefaults', defaults })
  }, [dispatch])

  return (
    <InternalSettingsView
      scale={state.scale}
      scaleId={scaleId}
      items={state.items}
      onScaleUpdated={handleScaleUpdated}
      likertDefaults={state.likertDefaults}
      onLikertDefaultsSaved={handleLikertDefaultsSaved}
      onReload={reload}
    />
  )
}

export default SettingsViewWrapper
