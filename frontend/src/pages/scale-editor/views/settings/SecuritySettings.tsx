import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../../components/Toast'
import { adminUpdateScale } from '../../../../api/client'
import { useScaleEditor } from '../../ScaleEditorContext'

const SecuritySettings: React.FC = () => {
  const { t } = useTranslation()
  const toast = useToast()
  const { state, dispatch, scaleId } = useScaleEditor()
  const { scale, settings } = state
  if (!scale) return null

  const update = useCallback((payload: Partial<typeof settings>) => {
    dispatch({ type: 'setSettings', payload })
  }, [dispatch])

  const save = async () => {
    const itemsPerPage = Number(settings.itemsPerPage || '0') || 0
    try {
      await adminUpdateScale(scaleId, {
        region: settings.region,
        collect_email: settings.collectEmail,
        turnstile_enabled: !!settings.turnstile,
        items_per_page: itemsPerPage,
        e2ee_enabled: !!scale.e2ee_enabled,
      } as any)
      dispatch({ type: 'setScale', scale: { ...scale, region: settings.region, collect_email: settings.collectEmail, turnstile_enabled: !!settings.turnstile, items_per_page: itemsPerPage } })
      toast.success(t('save_success'))
    } catch (e:any) {
      toast.error(e?.message || String(e))
    }
  }

  return (
    <div className="row">
      <div className="card span-6">
        <h4 className="section-title" style={{ marginTop: 0 }}>{t('editor.security')}</h4>
        <div className="item"><div className="label">{t('region')}</div>
          <select className="input" value={settings.region} onChange={e=> update({ region: e.target.value })}>
            <option value="auto">auto</option>
            <option value="gdpr">gdpr</option>
            <option value="pipl">pipl</option>
            <option value="pdpa">pdpa</option>
            <option value="ccpa">ccpa</option>
          </select>
        </div>
        <div className="item"><div className="label">{t('collect_email')}</div>
          <select className="input" value={settings.collectEmail} onChange={e=> update({ collectEmail: e.target.value as any })}>
            <option value="off">{t('collect_email_off')}</option>
            <option value="optional">{t('collect_email_optional')}</option>
            <option value="required">{t('collect_email_required')}</option>
          </select>
        </div>
        <label className="item" style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
          <input className="checkbox" type="checkbox" checked={settings.turnstile} onChange={e=> update({ turnstile: e.target.checked })} />
          <span>{t('turnstile.enable_label')||'Enable Cloudflare Turnstile'}</span>
        </label>
        <div className="item"><div className="label">{t('editor.items_per_page')}</div>
          <input className="input" type="number" min={0} value={settings.itemsPerPage} onChange={e=> update({ itemsPerPage: e.target.value })} placeholder="0 = all" />
        </div>
      </div>
      <div className="cta-row" style={{ gap:8 }}>
        <button className="btn btn-primary" type="button" onClick={save}>{t('save')}</button>
      </div>
    </div>
  )
}

export default SecuritySettings

