import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../../components/Toast'
import { adminUpdateScale } from '../../../../api/client'
import { useScaleEditor } from '../../ScaleEditorContext'

type ConsentMode = 'off' | 'optional' | 'required'

const CONSENT_PRESETS = [
  { key: 'withdrawal', label: 'survey.consent_opt.withdrawal' },
  { key: 'data_use', label: 'survey.consent_opt.data_use' },
  { key: 'recording', label: 'survey.consent_opt.recording' },
]

const ConsentSettings: React.FC = () => {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { state, dispatch, scaleId } = useScaleEditor()
  const { scale, consent } = state
  if (!scale) return null

  const updateConsent = useCallback((payload: Partial<typeof consent>) => {
    dispatch({ type: 'setConsent', payload: payload as any })
  }, [dispatch])
  const updateConsentOptions = useCallback((updater: (opts: any[])=> any[]) => {
    dispatch({ type: 'setConsentOptions', options: updater(consent.options) })
  }, [dispatch, consent.options])

  const setOptMode = useCallback((key: string, mode: ConsentMode) => {
    updateConsentOptions(list => {
      if (mode === 'off') return list.filter(o => o.key !== key)
      const idx = list.findIndex(o => o.key === key)
      const enLabel = i18n.t(`survey.consent_opt.${key}`, { lng: 'en' }) as string
      const zhLabel = i18n.t(`survey.consent_opt.${key}`, { lng: 'zh' }) as string
      const labelEn = enLabel && !enLabel.startsWith('survey.consent_opt.') ? enLabel : undefined
      const labelZh = zhLabel && !zhLabel.startsWith('survey.consent_opt.') ? zhLabel : undefined
      if (idx === -1) return [...list, { key, required: mode === 'required', en: labelEn, zh: labelZh }]
      const next = [...list]
      next[idx] = { ...next[idx], required: mode === 'required' }
      return next
    })
  }, [i18n, updateConsentOptions])

  const save = async () => {
    try {
      const keys = consent.options.map(o => o.key.trim())
      if (keys.some(k=>!k) || keys.some((k,idx)=> k && keys.indexOf(k)!==idx)) {
        toast.error(t('consent.advanced.save_first_error'))
        return
      }
      const payloadOptions = consent.options.map(option => {
        const entry: any = { key: option.key.trim(), required: !!option.required }
        const en = option.en?.trim() || ''
        const zh = option.zh?.trim() || ''
        if (en || zh) entry.label_i18n = { ...(en?{en}:{}) , ...(zh?{zh}:{}) }
        if (typeof option.group === 'number') entry.group = option.group
        return entry
      })
      const consentText = { en: consent.textEn.trim() ? consent.textEn : undefined, zh: consent.textZh.trim() ? consent.textZh : undefined }
      await adminUpdateScale(scaleId, { consent_i18n: consentText, consent_config: { version: consent.version || 'v1', options: payloadOptions, signature_required: !!consent.signatureRequired } } as any)
      dispatch({ type: 'setScale', scale: { ...scale, consent_i18n: { ...(scale.consent_i18n||{}), ...(consentText.en!==undefined?{en:consentText.en}:{}) , ...(consentText.zh!==undefined?{zh:consentText.zh}:{}) }, consent_config: { version: consent.version||'v1', options: payloadOptions, signature_required: !!consent.signatureRequired } } })
      toast.success(t('save_success'))
    } catch (e:any) { toast.error(e?.message || String(e)) }
  }

  const consentModeButtons = (key: string) => {
    const current = consent.options.find(o => o.key === key)
    const mode: ConsentMode = !current ? 'off' : current.required ? 'required' : 'optional'
    return (
      <div className="cta-row" style={{ gap: 8 }}>
        {(['off','optional','required'] as ConsentMode[]).map(value => (
          <button key={value} type="button" className={`btn ${mode===value?'btn-primary':'btn-ghost'}`} onClick={()=> setOptMode(key, value)}>
            {value==='off'? t('consent.mode.off') : value==='optional'? t('consent.mode.optional') : t('consent.mode.required')}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="row">
      <div className="card span-12">
        <h4 className="section-title" style={{ marginTop: 0 }}>{t('consent_settings')}</h4>
        <div className="row">
          <div className="card span-6">
            <div className="item"><div className="label">{t('consent_en')}</div>
              <textarea className="input" rows={4} value={consent.textEn} onChange={e=> updateConsent({ textEn: e.target.value })} placeholder={t('consent_hint') as string} />
            </div>
          </div>
          <div className="card span-6">
            <div className="item"><div className="label">{t('consent_zh')}</div>
              <textarea className="input" rows={4} value={consent.textZh} onChange={e=> updateConsent({ textZh: e.target.value })} placeholder={t('consent_hint') as string} />
            </div>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>{t('consent.inline_hint')}</div>
        <div className="muted" style={{ marginBottom: 12 }}>{t('consent.group_hint')}</div>
        <div className="tile" style={{ padding: 10, marginTop: 8 }}>
          <div className="item"><div className="label">{t('consent.presets_title')}</div>
            <div className="cta-row" style={{ gap: 8, flexWrap:'wrap' }}>
              {CONSENT_PRESETS.map(p => (
                <button key={p.key} type="button" className="btn btn-ghost" onClick={()=> setOptMode(p.key as any, 'required')}>{t(p.label)}</button>
              ))}
            </div>
          </div>
          <label className="item" style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
            <input className="checkbox" type="checkbox" checked={!!consent.signatureRequired} onChange={e=> updateConsent({ signatureRequired: e.target.checked })} />
            <span>{t('consent.advanced.signature_hint')}</span>
          </label>
          <div className="item"><div className="label">{t('label.version')}</div>
            <input className="input" value={consent.version} onChange={e=> updateConsent({ version: e.target.value })} />
          </div>
          <table className="consent-table">
            <thead><tr>
              <th>{t('consent.advanced.label_en')}</th>
              <th>{t('consent.advanced.label_zh')}</th>
              <th>{t('consent.advanced.group')}</th>
              <th>{t('consent.advanced.required')}</th>
              <th>{t('actions')}</th>
            </tr></thead>
            <tbody>
              {consent.options.length === 0 && (
                <tr><td colSpan={5} className="muted">{t('consent.advanced.empty')}</td></tr>
              )}
              {consent.options.map((option, idx) => (
                <tr key={option.key || idx}>
                  <td data-label={t('consent.advanced.label_en')}><input className="input" value={option.en||''} onChange={e=> updateConsentOptions(list=> list.map((entry,i)=> i===idx?{...entry,en:e.target.value}:entry))} placeholder={t('optional')} /></td>
                  <td data-label={t('consent.advanced.label_zh')}><input className="input" value={option.zh||''} onChange={e=> updateConsentOptions(list=> list.map((entry,i)=> i===idx?{...entry,zh:e.target.value}:entry))} placeholder={t('optional')} /></td>
                  <td data-label={t('consent.advanced.group')}><input className="input" type="number" value={option.group ?? ''} onChange={e=> { const raw=e.target.value; updateConsentOptions(list=> list.map((entry,i)=> { if(i!==idx) return entry; if(!raw.trim()) return {...entry, group: undefined}; const n=Number(raw); if(Number.isNaN(n)) return entry; return {...entry, group: n} })) }} /></td>
                  <td data-label={t('consent.advanced.required')}><label className="toggle"><input className="checkbox" type="checkbox" checked={!!option.required} onChange={e=> updateConsentOptions(list=> list.map((entry,i)=> i===idx?{...entry,required:e.target.checked}:entry))} /></label></td>
                  <td>
                    <div className="cta-row" style={{ gap:6, justifyContent:'flex-end' }}>
                      <button type="button" className="btn btn-ghost" onClick={()=> updateConsentOptions(list=> { const target=idx-1; if(target<0) return list; const next=[...list]; const tmp=next[idx]; next[idx]=next[target]; next[target]=tmp; return next })} disabled={idx===0}>↑</button>
                      <button type="button" className="btn btn-ghost" onClick={()=> updateConsentOptions(list=> { const target=idx+1; if(target>=list.length) return list; const next=[...list]; const tmp=next[idx]; next[idx]=next[target]; next[target]=tmp; return next })} disabled={idx===consent.options.length-1}>↓</button>
                      <button type="button" className="btn btn-ghost" onClick={()=> updateConsentOptions(list=> list.filter((_,i)=> i!==idx))}>{t('delete')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cta-row" style={{ marginTop: 12 }}>
            <button className="btn" type="button" onClick={()=> updateConsentOptions(list=> [...list, { key: `custom_${Date.now()}`, required:false }])}>{t('consent.advanced.add_option')}</button>
            <button className="btn btn-primary" type="button" onClick={save}>{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConsentSettings

