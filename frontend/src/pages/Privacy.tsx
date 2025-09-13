import React from 'react'
import { useTranslation } from 'react-i18next'

export function Privacy() {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  return (
    <div className="card span-12" style={{padding:'20px'}}>
      <h2 className="section-title" style={{marginTop:0}}>{t('home.privacy.title', { defaultValue: 'Privacy & Compliance' })}</h2>
      <div className="divider" />

      <h3>{isZh ? '服务器与地区' : 'Servers & Regions'}</h3>
      <p className="muted">{t('home.privacy.server')}</p>

      <h3>{isZh ? 'Cloudflare CDN 与边缘节点' : 'Cloudflare CDN & Edge'}</h3>
      <p className="muted">{t('home.privacy.cdn')}</p>
      <p className="muted">{t('home.privacy.metadata')}</p>
      <p className="muted">{t('home.privacy.assure')} <a href="https://www.cloudflare.com/trust-hub/gdpr/" target="_blank" rel="noreferrer">GDPR</a> · <a href="https://www.pdpc.gov.sg/" target="_blank" rel="noreferrer">PDPA</a>. {t('home.privacy.dpa')} (<a href="https://www.cloudflare.com/cloudflare-customer-dpa/" target="_blank" rel="noreferrer">{t('home.privacy.dpa_link')}</a>).</p>

      <h3>{isZh ? 'Cookie 与偏好' : 'Cookies & Preferences'}</h3>
      <ul>
        <li>{isZh ? '默认仅启用必要 Cookie；分析/第三方需用户同意。' : 'Necessary only by default; analytics/3rd‑party are opt‑in.'}</li>
        <li>{isZh ? '支持“仅必要/自定义同意”，且可随时修改。' : 'Granular control (only necessary/custom consent) and change anytime.'}</li>
      </ul>

      <h3>{isZh ? '参与者权利' : 'Participant Rights'}</h3>
      <ul>
        <li>{isZh ? '访问/更正/删除/数据可携（CSV/JSON）。' : 'Access / Rectification / Deletion / Portability (CSV/JSON).'} </li>
      </ul>

      <h3>{isZh ? '联系我们' : 'Contact'}</h3>
      <p>Data Protection Contact: privacy@synap.local</p>
    </div>
  )
}
