import React from 'react'
import { useTranslation } from 'react-i18next'
import { useScaleEditor } from '../../ScaleEditorContext'

const ExportSettings: React.FC = () => {
  const { t } = useTranslation()
  const { state } = useScaleEditor()
  const { scale } = state
  if (!scale) return null
  const sid = (scale as any).id || ''
  const isE2EE = !!(scale as any).e2ee_enabled
  return (
    <div className="row">
      <div className="card span-12">
        <h4 className="section-title" style={{ marginTop: 0 }}>{t('export')||'Export'}</h4>
        {isE2EE ? (
          <div className="tile" style={{ padding: 10 }}>
            <div className="muted" style={{ marginBottom: 8 }}>{t('e2ee.csv_disabled_title')||'CSV exports are disabled when end‑to‑end encryption is ON'}</div>
            <div className="muted">{t('e2ee.local_export_desc')||'Local plaintext export decrypts in your browser.'}</div>
          </div>
        ) : (
          <div className="cta-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <a className="btn" href={`/api/export?format=long&scale_id=${encodeURIComponent(sid)}`} target="_blank" rel="noreferrer">{t('export_long_csv')}</a>
            <a className="btn" href={`/api/export?format=wide&scale_id=${encodeURIComponent(sid)}`} target="_blank" rel="noreferrer">{t('export_wide_csv')}</a>
            <a className="btn" href={`/api/export?format=score&scale_id=${encodeURIComponent(sid)}`} target="_blank" rel="noreferrer">{t('export_score_csv')}</a>
            <a className="btn" href={`/api/export?format=items&scale_id=${encodeURIComponent(sid)}`} target="_blank" rel="noreferrer">{t('export_items_csv')||'Export Items CSV'}</a>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExportSettings

