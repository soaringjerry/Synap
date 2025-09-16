import React from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../components/Toast'
import { adminPurgeResponses } from '../../../api/client'
import { useScaleEditor } from '../ScaleEditorContext'

export const DangerZone: React.FC = () => {
  const { t } = useTranslation()
  const toast = useToast()
  const { scaleId } = useScaleEditor()

  const onPurge = async () => {
    try {
      const warn =
        t('confirm_delete_responses') ||
        'Delete ALL responses for this scale? This cannot be undone.'
      const promptMsg = `${warn}\n\nType the scale ID to confirm: ${scaleId}`
      const input = window.prompt(promptMsg)
      if (!input || input.trim() !== scaleId) return
      await adminPurgeResponses(scaleId)
      toast.success(t('delete_success'))
    } catch (err: any) {
      toast.error(err?.message || String(err))
    }
  }

  return (
    <div className="row" style={{ marginTop: 16 }}>
      <div className="card span-12" style={{ borderColor: 'rgba(248,113,113,0.45)' }}>
        <h4 className="section-title" style={{ marginTop: 0 }}>{t('danger_zone')}</h4>
        <div className="muted" style={{ marginBottom: 8 }}>{t('confirm_delete_responses')}</div>
        <button type="button" className="btn" onClick={onPurge}>{t('delete_all_responses')}</button>
      </div>
    </div>
  )
}

export default DangerZone
