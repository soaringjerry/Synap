import React from 'react'
import { useTranslation } from 'react-i18next'

export function Privacy() {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  return (
    <div className="card span-12" style={{padding:'20px'}}>
      <h2 className="section-title" style={{marginTop:0}}>Privacy Policy｜隐私政策</h2>
      <p className="muted">Version: v1.0 • Effective: 2025-09-14 • Primary storage: Singapore｜版本：v1.0 • 生效：2025-09-14 • 主存储地：新加坡</p>
      <p className="muted">Language: English prevails if inconsistent｜语言提示：如中英不一致，以英文为准。</p>
      <div className="divider" />

      <h3>1. Scope & Roles｜适用范围与角色</h3>
      <p><b>EN —</b> Hosted: you/your institution are Controller; we act as Processor per your instructions. Self‑host: you are responsible for your instance; this Policy doesn’t apply to your self‑hosted deployment.</p>
      <p><b>ZH —</b> 托管：你/你的机构为控制者；我们按你的书面指示作为处理者。自托管：你自行负责；本政策不适用于自托管。</p>

      <h3>2. Data We Collect｜我们收集的数据</h3>
      <p><b>EN —</b> (a) Account data; (b) Surveys & responses; (c) Technical logs (may include IP address, device and browser signals; some may also be collected by third‑party providers such as Cloudflare CDN/Turnstile for security and anti‑abuse purposes); (d) Cookies — necessary by default; analytics/performance require opt‑in.</p>
      <p><b>Learn More:</b> <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare Privacy Policy</a></p>
      <p><b>ZH —</b> (a) 账户；(b) 问卷与作答；(c) 技术日志（可能包含 IP 地址、设备与浏览器信号；部分数据也可能由 Cloudflare CDN/Turnstile 等第三方为安全与防滥用目的收集）；(d) Cookie —— 默认仅必要；分析/性能需同意。</p>
      <p><b>了解更多：</b><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare 隐私政策</a></p>

      <h3>3. Purposes & Legal Bases｜处理目的与法律依据</h3>
      <p><b>EN —</b> Provide/improve services, security, support, compliance. Legal bases: contract, legitimate interests, consent, legal obligation.</p>
      <p><b>ZH —</b> 提供/改进服务、安全、支持与合规。法律依据：合同、合法利益、同意、法定义务。</p>

      <h3>4. Storage, Transfers & CDN｜存储、跨境与 CDN</h3>
      <p className="muted">{t('home.privacy.server')}</p>
      <p className="muted">{t('home.privacy.cdn')}</p>
      <p className="muted">{t('home.privacy.metadata')}</p>
      <p className="muted">{t('home.privacy.assure')} <a href="https://www.cloudflare.com/trust-hub/gdpr/" target="_blank" rel="noreferrer">GDPR</a> · <a href="https://www.pdpc.gov.sg/" target="_blank" rel="noreferrer">PDPA</a>. {t('home.privacy.dpa')} (<a href="https://www.cloudflare.com/cloudflare-customer-dpa/" target="_blank" rel="noreferrer">{t('home.privacy.dpa_link')}</a>).</p>

      <h3>5. GDPR & PDPA Alignment (No Compliance Guarantee)｜GDPR/PDPA 对齐</h3>
      <p><b>EN —</b> We align to core principles, but do not guarantee your particular use is compliant; you remain the Controller. </p>
      <p><b>ZH —</b> 我们对齐核心原则，但不保证你的具体使用自动合规；你仍为控制者。</p>

      <h3>6. Notice for Users in China (PIPL)｜中国用户提示</h3>
      <p><b>EN —</b> We do not fully comply with PIPL local‑storage/cross‑border requirements; continuing implies consent to overseas processing.</p>
      <p><b>ZH —</b> 我们未完全满足 PIPL 要求；继续使用即表示同意境外存储与处理。</p>

      <h3>7. Your Rights｜你的权利</h3>
      <p><b>EN —</b> GDPR: access, rectification, erasure, restriction, portability, objection, consent withdrawal. PDPA: access, correction, withdrawal.</p>
      <p><b>ZH —</b> GDPR：查阅、更正、删除、限制、可携、反对、撤回同意。PDPA：查阅、更正、撤回同意。</p>

      <h3>8. Retention & Deletion｜保留与删除</h3>
      <p><b>EN —</b> Controllers set retention; recommend delete/anonymize within 12 months after completion.</p>
      <p><b>ZH —</b> 保留期限由控制者设置；建议在研究结束后 12 个月内删除或匿名化。</p>

      <h3>9. Children & Special Categories｜未成年人与敏感信息</h3>
      <p><b>EN —</b> No minors’ data without verifiable consent; no special‑category data without lawful basis and explicit consent.</p>
      <p><b>ZH —</b> 未经可验证的监护人同意，不得收集未成年人数据；无合法依据与明确同意，不得收集敏感信息。</p>

      <h3>10. Security & Breach Notice (No Liability)｜安全与事件通知</h3>
      <p><b>EN —</b> Access control, encryption, backups, monitoring; no system is 100% secure; to the maximum extent permitted by law, no liability.</p>
      <p><b>ZH —</b> 实施访问控制、加密、备份与监控；任何系统都无法 100% 安全；在法律允许范围内不承担相关责任。</p>

      <h3>11. Sharing with Third Parties｜第三方共享</h3>
      <p><b>EN —</b> Shared only as necessary to provide services or comply with law (e.g., Cloudflare CDN/security, email delivery, error monitoring). No sale of personal data.</p>
      <p><b>ZH —</b> 仅在必要时共享（如 Cloudflare、邮件、错误监控）；不出售个人数据。</p>

      <h3>11.1 Cloudflare Turnstile｜Cloudflare Turnstile 人机验证</h3>
      <p><b>EN —</b> Some surveys may enable Cloudflare Turnstile (bot protection). Turnstile processes client‑side signals ("Signals") such as client IP address, TLS fingerprint, User‑Agent header, and the sitekey with associated origin. Cloudflare states it does not have the ability to directly identify any individuals from any Signals Turnstile collects, including IP addresses. Signals are used only to detect and prevent automated abuse, not for advertising, and are not shared with external trackers. <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noreferrer">Learn more</a>.</p>
      <p><b>ZH —</b> 部分问卷可能启用 Cloudflare Turnstile 验证机制（防止机器人滥用）。Turnstile 会处理多种客户端信号（“Signals”），例如客户端 IP 地址、TLS 指纹、User‑Agent 请求头以及站点密钥与来源等。Cloudflare 表示其无法基于 Turnstile 收集的任何 Signals（包括 IP 地址）直接识别到个人身份。上述信号仅用于识别与防止自动化滥用，不用于广告，也不会与外部追踪器共享。<a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noreferrer">了解更多</a>。</p>

      <h3>12. Cookies & Preferences｜Cookie 与偏好</h3>
      <p><b>EN —</b> Necessary cookies always on; analytics/performance opt‑in; banner and preferences link provided.</p>
      <p><b>ZH —</b> 必要 Cookie 始终开启；分析/性能需同意；提供横幅与偏好入口。</p>

      <h3>13. Changes｜更新</h3>
      <p><b>EN —</b> We will post updates with an effective date; material changes highlighted.</p>
      <p><b>ZH —</b> 将公布更新并标注生效日期；重大变更将显著提示。</p>
    </div>
  )
}
