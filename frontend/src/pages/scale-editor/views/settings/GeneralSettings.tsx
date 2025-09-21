import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../../components/Toast'
import { adminUpdateScale } from '../../../../api/client'
import { useScaleEditor } from '../../ScaleEditorContext'

const sanitizeNumber = (value: string, fallback: number): number => {
  const parsed = parseInt(value || '0', 10)
  if (Number.isNaN(parsed)) return fallback
  return parsed
}

const GeneralSettings: React.FC = () => {
  const { t } = useTranslation()
  const toast = useToast()
  const { state, dispatch, scaleId } = useScaleEditor()
  const { scale, settings } = state
  if (!scale) return null

  const update = useCallback((payload: Partial<typeof settings>) => {
    dispatch({ type: 'setSettings', payload })
  }, [dispatch, settings])

  const save = async () => {
    const pointsNumber = sanitizeNumber(settings.points, scale.points || 5)
    const likertLabelsEn = settings.likertLabelsEn.split(/[,，]/).map(s=>s.trim()).filter(Boolean)
    const likertLabelsZh = settings.likertLabelsZh.split(/[,，]/).map(s=>s.trim()).filter(Boolean)
    const likertLabelsPayload: Record<string,string[]> = {}
    if (likertLabelsEn.length) likertLabelsPayload.en = likertLabelsEn
    if (likertLabelsZh.length) likertLabelsPayload.zh = likertLabelsZh
    try {
      await adminUpdateScale(scaleId, {
        name_i18n: { ...(scale.name_i18n || {}), en: settings.nameEn, zh: settings.nameZh },
        points: pointsNumber,
        likert_labels_i18n: likertLabelsPayload,
        likert_show_numbers: !!settings.likertShowNumbers,
        likert_preset: settings.likertPreset,
      } as any)
      dispatch({ type: 'setScale', scale: { ...scale, points: pointsNumber, name_i18n: { ...(scale.name_i18n||{}), en: settings.nameEn, zh: settings.nameZh }, likert_labels_i18n: likertLabelsPayload, likert_show_numbers: !!settings.likertShowNumbers, likert_preset: settings.likertPreset } })
      toast.success(t('save_success'))
    } catch (e:any) {
      toast.error(e?.message || String(e))
    }
  }

  return (
    <div className="row">
      <div className="card span-6" style={{ display:'flex', flexDirection:'column' }}>
        <h4 className="section-title" style={{ marginTop: 0 }}>{t('editor.basic_info')}</h4>
        <div className="item"><div className="label">{t('name_en')}</div>
          <input className="input" value={settings.nameEn} onChange={e=> update({ nameEn: e.target.value })} />
        </div>
        <div className="item"><div className="label">{t('name_zh')}</div>
          <input className="input" value={settings.nameZh} onChange={e=> update({ nameZh: e.target.value })} />
        </div>
        <div className="item"><div className="label">{t('points')}</div>
          <input className="input" type="number" min={1} value={settings.points} onChange={e=> update({ points: e.target.value })} />
        </div>
        <div className="cta-row" style={{ gap:8, justifyContent:'flex-end', marginTop: 12 }}>
          <button className="btn btn-primary" type="button" onClick={save}>{t('save')}</button>
        </div>
      </div>
      <div className="card span-6" style={{ display:'flex', flexDirection:'column' }}>
        <h4 className="section-title" style={{ marginTop: 0 }}>{t('likert.defaults')}</h4>
        <div className="muted" style={{ marginBottom: 6 }}>{t('likert.apply_hint')}</div>
        <div className="item"><div className="label">{t('likert.presets.title')}</div>
          <select className="input" value={settings.likertPreset} onChange={e=> update({ likertPreset: e.target.value })}>
            <option value="numeric">{t('likert.presets.numeric')}</option>
            <option value="agree5">{t('likert.presets.agree5')}</option>
            <option value="freq5">{t('likert.presets.freq5')}</option>
            <option value="agree7">{t('likert.presets.agree7')}</option>
            <option value="bipolar7">{t('likert.presets.bipolar7')}</option>
            <option value="mono5">{t('likert.presets.mono5')}</option>
          </select>
        </div>
        <div className="item"><div className="label">EN</div>
          <input className="input" value={settings.likertLabelsEn} onChange={e=> update({ likertLabelsEn: e.target.value })} placeholder={t('hint.likert_anchors_en') as string} />
        </div>
        <div className="item"><div className="label">ZH</div>
          <input className="input" value={settings.likertLabelsZh} onChange={e=> update({ likertLabelsZh: e.target.value })} placeholder={t('hint.likert_anchors_zh') as string} />
        </div>
        <label className="item" style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
          <input className="checkbox" type="checkbox" checked={settings.likertShowNumbers} onChange={e=> update({ likertShowNumbers: e.target.checked })} />
          <span>{t('likert.show_numbers')}</span>
        </label>
        <div className="cta-row" style={{ gap:8, justifyContent:'flex-end', marginTop: 12 }}>
          <button className="btn btn-primary" type="button" onClick={save}>{t('save')}</button>
        </div>
      </div>
    </div>
  )
}

export default GeneralSettings
