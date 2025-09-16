import React from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../components/Toast'
import { useScaleEditor } from '../ScaleEditorContext'
import ExportPanel from '../components/ExportPanel'

const getOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '')

const buildShareLink = (scaleId: string, lang?: string) => {
  const base = `${getOrigin()}/survey/${encodeURIComponent(scaleId)}`
  return lang ? `${base}?lang=${lang}` : base
}

export const ShareView: React.FC = () => {
  const { t } = useTranslation()
  const toast = useToast()
  const { state, scaleId } = useScaleEditor()
  const { scale, analytics, items } = state

  if (!scale) return null

  const copyLink = async (lang?: string) => {
    try {
      const url = buildShareLink(scaleId, lang)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        toast.success(t('copied'))
      } else {
        toast.info(url)
      }
    } catch (err: any) {
      toast.error(err?.message || String(err))
    }
  }

  return (
    <>
      <div className="row">
        <div className="card span-6">
          <h4 className="section-title" style={{ marginTop: 0 }}>{t('share')}</h4>
          <div className="item">
            <div className="label">{t('label.url')}</div>
            <input className="input" value={buildShareLink(scaleId)} readOnly />
          </div>
          <div className="cta-row">
            <button type="button" className="btn" onClick={() => copyLink()}>{t('editor.copy_link')}</button>
          </div>
        </div>
        <div className="card span-6">
          <h4 className="section-title" style={{ marginTop: 0 }}>{t('analytics')}</h4>
          {!analytics && <div className="muted">{t('editor.no_data')}</div>}
          {analytics && (
            <div>
              {scale.e2ee_enabled ? (
                <div className="item stat-row">
                  <div className="label">{t('total_responses')}</div>
                  <div className="muted">{t('e2ee.analytics_total_unavailable')}</div>
                </div>
              ) : (
                <div className="item stat-row">
                  <div className="label">{t('total_responses')}</div>
                  <div>{analytics.total_responses || 0}</div>
                </div>
              )}
              {scale.e2ee_enabled ? (
                <div className="tile" style={{ padding: 8, marginTop: 8 }}>
                  <div className="muted">{t('e2ee.analytics_notice')}</div>
                </div>
              ) : (
                analytics.items && analytics.items.length > 0 && (
                  <div className="tile" style={{ padding: 8, marginTop: 8 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>{t('editor.item_distributions')}</div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `240px repeat(${Math.min(10, (analytics.items?.[0]?.histogram?.length || 5))}, 1fr)`,
                        gap: 6,
                        alignItems: 'center',
                      }}
                    >
                      <div />
                      {Array.from({
                        length: Math.min(10, (analytics.items?.[0]?.histogram?.length || 5)),
                      }, (_, i) => i + 1).map(i => (
                        <div key={i} className="muted" style={{ textAlign: 'center' }}>{i}</div>
                      ))}
                      {analytics.items.map((item: any) => (
                        <React.Fragment key={item.id}>
                          <div className="muted" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.stem_i18n?.en || item.id}
                          </div>
                          {item.histogram.map((value: number, columnIndex: number) => (
                            <div
                              key={`${item.id}-${columnIndex}`}
                              title={`${value}`}
                              style={{
                                height: 18,
                                borderRadius: 3,
                                background: `hsla(${200 + (value / Math.max(1, item.total)) * 80},90%,55%,${0.15 + 0.85 * (value / Math.max(1, item.total))})`,
                              }}
                            />
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
          <ExportPanel />
        </div>
      </div>
    </>
  )
}

export default ShareView
