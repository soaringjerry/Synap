import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useToast } from '../../../../components/Toast'
import { adminAITranslatePreview, adminUpdateItem, adminUpdateScale } from '../../../../api/client'
import { useScaleEditor } from '../../ScaleEditorContext'

const AISettings: React.FC = () => {
  const { t } = useTranslation()
  const toast = useToast()
  const { state, dispatch, scaleId, reload } = useScaleEditor()
  const { scale, items, ai } = state
  if (!scale) return null

  const setAiState = useCallback((payload: Partial<typeof ai>) => {
    dispatch({ type: 'setAiState', payload })
  }, [dispatch])
  const updateAiPreview = useCallback((updater: (prev:any|null)=> any|null) => {
    dispatch({ type: 'updateAiPreview', updater })
  }, [dispatch])
  const setAiInclude = useCallback((include: Record<string,boolean>) => {
    dispatch({ type: 'setAiInclude', include })
  }, [dispatch])

  return (
    <div className="row">
      <div className="card span-6">
        <h4 className="section-title" style={{ marginTop: 0 }}>{t('ai.title')}</h4>
        <div className="muted" style={{ marginBottom: 8 }}>{t('ai.steps')}</div>
        <div className="item"><div className="label">{t('ai.targets')}</div>
          <input className="input" value={ai.targets} onChange={e=> setAiState({ targets: e.target.value })} placeholder="zh, en" />
        </div>
        <div className="cta-row" style={{ flexWrap:'wrap', gap:8 }}>
          <button className="btn btn-ghost" type="button" onClick={()=> setAiState({ targets: 'zh' })}>EN→ZH</button>
          <button className="btn btn-ghost" type="button" onClick={()=> setAiState({ targets: 'en' })}>ZH→EN</button>
          <button className="btn btn-ghost" type="button" onClick={()=> setAiState({ targets: 'zh,en,fr,de' })}>+Common</button>
          <Link className="btn btn-ghost" to="/admin/ai">{t('ai.provider')}</Link>
          <button type="button" className="btn" disabled={ai.working} onClick={async ()=>{
            setAiState({ msg: '', preview: null, working: true })
            try {
              const langs = ai.targets.split(/[ ,\n]+/).map(s=>s.trim()).filter(Boolean)
              const res = await adminAITranslatePreview(scaleId, langs)
              updateAiPreview(()=> res)
              const defaults: Record<string,boolean> = {}; for(const it of items) defaults[it.id] = true
              setAiInclude(defaults)
            } catch (err:any) { setAiState({ msg: err?.message || String(err) }); toast.error(err?.message || String(err)) } finally { setAiState({ working:false }) }
          }}>{ai.working? t('working') : t('preview')}</button>
        </div>
      </div>
      <div className="card span-6">
        <h4 className="section-title" style={{ marginTop: 0 }}>{t('ai.preview_title')}</h4>
        {ai.preview && (
          <div className="tile" style={{ padding:10, marginTop:8 }}>
            <div className="muted" style={{ marginBottom: 8 }}>{t('ai.review')}</div>
            {Object.entries(ai.preview.name_i18n || {}).length>0 && (
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:8 }}>
                <div className="muted" style={{ marginBottom:6 }}>name_i18n</div>
                <div className="row">
                  {Object.entries(ai.preview.name_i18n).map(([lang,val]) => (
                    <div key={lang} className="card span-6" style={{ minWidth: 200 }}>
                      <div className="label">{lang}</div>
                      <textarea className="input" rows={2} defaultValue={val as string} onChange={e=> updateAiPreview(prev=> ({ ...(prev||{}), name_i18n: { ...(prev?.name_i18n||{}), [lang]: e.target.value } })) } />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {ai.preview.consent_i18n && Object.keys(ai.preview.consent_i18n).length>0 && (
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:8, marginTop:8 }}>
                <div className="muted" style={{ marginBottom:6 }}>consent_i18n</div>
                <div className="row">
                  {Object.entries(ai.preview.consent_i18n).map(([lang,val]) => (
                    <div key={lang} className="card span-6" style={{ minWidth: 200 }}>
                      <div className="label">{lang}</div>
                      <textarea className="input" rows={2} defaultValue={val as string} onChange={e=> updateAiPreview(prev=> ({ ...(prev||{}), consent_i18n: { ...(prev?.consent_i18n||{}), [lang]: e.target.value } })) } />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="muted" style={{ marginBottom: 8 }}>{t('editor.your_items')}</div>
            {items.map(item => {
              const previewForItem = (ai.preview.items || {})[item.id] || {}
              if (Object.keys(previewForItem).length === 0) return null
              return (
                <div key={item.id} style={{ borderTop:'1px solid var(--border)', paddingTop:12, marginTop:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                    <label style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                      <input className="checkbox" type="checkbox" checked={!!ai.include[item.id]} onChange={e=> setAiInclude({ ...ai.include, [item.id]: e.target.checked })} />
                      <span>{t('ai.include_label')}</span>
                    </label>
                    <div><b>{item.id}</b> · {item.stem_i18n?.en || item.stem || item.id}</div>
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    {Object.entries(previewForItem).map(([lang, val]) => (
                      <div key={lang} className="card span-6" style={{ minWidth: 260 }}>
                        <div className="label">{lang}</div>
                        <textarea className="input" rows={3} defaultValue={val as string} onChange={e=> updateAiPreview(prev=> ({ ...(prev||{}), items: { ...(prev?.items||{}), [item.id]: { ...(prev?.items?.[item.id]||{}), [lang]: e.target.value } } })) } />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            <div className="cta-row" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-primary" disabled={ai.applying} onClick={async ()=>{
                setAiState({ applying: true })
                try {
                  for (const item of items) {
                    if (!ai.include[item.id]) continue
                    const additions = (ai.preview.items || {})[item.id] || {}
                    if (Object.keys(additions).length === 0) continue
                    await adminUpdateItem(item.id, { stem_i18n: { ...(item.stem_i18n || {}), ...(additions as any) } })
                  }
                  const scaleUpdates: any = {}
                  if (ai.preview.name_i18n) scaleUpdates.name_i18n = { ...(scale.name_i18n||{}), ...(ai.preview.name_i18n as Record<string,string>) }
                  if (ai.preview.consent_i18n) scaleUpdates.consent_i18n = { ...(scale.consent_i18n||{}), ...(ai.preview.consent_i18n as Record<string,string>) }
                  if (Object.keys(scaleUpdates).length>0) await adminUpdateScale(scaleId, scaleUpdates)
                  toast.success(t('save_success'))
                  updateAiPreview(()=> null); setAiInclude({}); await reload()
                } catch (err:any) { setAiState({ msg: err?.message || String(err) }); toast.error(err?.message || String(err)) } finally { setAiState({ applying:false }) }
              }}>{ai.applying? t('working') : t('apply')}</button>
              <button type="button" className="btn btn-ghost" onClick={()=> { updateAiPreview(()=> null); setAiInclude({}) }}>{t('cancel')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AISettings

