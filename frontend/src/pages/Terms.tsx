import React from 'react'

export function Terms() {
  return (
    <div className="card span-12" style={{padding:'20px'}}>
      <h2 className="section-title" style={{marginTop:0}}>Terms of Service｜用户协议</h2>
      <p className="muted">Version: v1.0 • Effective: 2025-09-14 • Governing law: Singapore｜版本：v1.0 • 生效日期：2025-09-14 • 适用法律：新加坡</p>
      <p className="muted">Language: In case of any inconsistency, the English version prevails.｜语言提示：如中英文本不一致，以英文版本为准。</p>
      <div className="divider" />

      <h3>1. About Synap｜关于本服务</h3>
      <p>
        <b>EN —</b> Synap is an open-source project for psychology & social-science surveys. The hosted website and services (“Services”) are provided free of charge, as Beta, with no SLA. If you self-host the open-source code, your use is governed by the license published in the project’s GitHub repository; these Terms apply only to our hosted site/services.
      </p>
      <p>
        <b>ZH —</b> Synap 是面向心理学与社会科学调查的开源项目。我们提供的托管网站与服务（下称“本服务”）目前免费、处于 Beta 阶段，且不提供 SLA。若你选择自托管开源代码，适用项目 GitHub 仓库中的 LICENSE 文件；本协议仅适用于我们提供的托管与官网。
      </p>

      <h3>2. Eligibility & Accounts｜资格与账户</h3>
      <p><b>EN —</b> You must have legal capacity to contract. Keep your credentials secure; no transfer or sharing.</p>
      <p><b>ZH —</b> 你须具备完全民事行为能力。妥善保管账户，不得转让或共享。</p>

      <h3>3. Open Source & Ownership｜开源与权属</h3>
      <p><b>EN —</b> The open-source code is licensed as stated in the LICENSE file. Surveys and responses remain yours (or your institution’s). You grant us limited rights necessary to host, process, back up, and transmit solely to provide the Services.</p>
      <p><b>ZH —</b> 开源代码许可以仓库 LICENSE 为准。你创建的问卷与所收集数据归你或你的机构所有。为提供本服务，你授予我们必要的托管、处理、备份与传输的有限许可。</p>

      <h3>4. Acceptable Use｜允许与禁止使用</h3>
      <p><b>EN —</b> Research & education only; comply with laws/ethics (IRB/REC). No unlawful/harassing/discriminatory/abusive use. Do not collect special-category or minors’ data without a lawful basis and explicit consent.</p>
      <p><b>ZH —</b> 仅限合法研究/教育目的；遵守法律与伦理审查。不得违法、骚扰、歧视或滥用；未经合法依据与明确同意，不得收集敏感或未成年人信息。</p>

      <h3>5. Roles & Research Compliance｜角色与研究合规</h3>
      <p><b>EN —</b> Hosted: you are Controller; we act as Processor per your instructions. Self-host: you are Controller and Processor. You remain responsible for lawful basis, consent, notices, rights, and DPIAs.</p>
      <p><b>ZH —</b> 托管：你为控制者；我们依指示作为处理者。自托管：你同时为控制者与处理者。你负责合法依据、同意、告知、权利与必要时的 DPIA。</p>

      <h3>6. Third-Party & OSS Components｜第三方与开源依赖</h3>
      <p><b>EN —</b> Services may rely on third parties (e.g., Cloudflare CDN/edge) and OSS, each under their own terms.</p>
      <p><b>ZH —</b> 可能集成第三方（如 Cloudflare）与开源组件，分别受其条款/许可证约束。</p>

      <h3>7. No Fees; Beta; No Support Obligation｜免费、Beta、无支持义务</h3>
      <p><b>EN —</b> Services are free and Beta; no obligation for support, maintenance, patches, backups, or recovery.</p>
      <p><b>ZH —</b> 本服务免费且为 Beta；无支持、维护、修复、备份或恢复义务。</p>

      <h3>8. No Warranties｜无担保</h3>
      <p><b>EN —</b> Provided “AS IS” and “AS AVAILABLE.” No warranties of any kind. No medical/psychological diagnosis or professional advice.</p>
      <p><b>ZH —</b> 按“现状”“可得”提供，不作任何担保；不构成医疗/心理诊断或专业意见。</p>

      <h3>9. Limitation of Liability (Zero-Fee = Zero Liability)｜责任限制（零费用=零责任）</h3>
      <p><b>EN —</b> To the maximum extent permitted by law, aggregate liability is SGD 0. Not liable for any direct/indirect/incidental/punitive/special/consequential damages. Sole remedy: stop using and export/delete your data. Note: Mandatory laws prevail.</p>
      <p><b>ZH —</b> 在法允许范围内，总责任为 0 新币。对各种损害不承担责任；唯一救济为停止使用并导出/删除数据。注：不影响强制性法律。</p>

      <h3>10. Indemnity｜赔偿</h3>
      <p><b>EN —</b> You agree to indemnify us for third‑party claims arising from your use/content/processing.</p>
      <p><b>ZH —</b> 因你使用/内容/处理引起的第三方主张，由你进行赔偿与抗辩。</p>

      <h3>11. Termination & Export｜终止与导出</h3>
      <p><b>EN —</b> You may stop anytime; we may suspend/terminate for breach/security risk. Export tools may be provided when feasible.</p>
      <p><b>ZH —</b> 你可随时停止；违反协议或存在安全风险我们可暂停/终止。我们会在可行范围内提供导出工具。</p>

      <h3>12. Force Majeure｜不可抗力</h3>
      <p><b>EN —</b> No liability for events beyond reasonable control.</p>
      <p><b>ZH —</b> 对合理控制范围外事件导致的延迟/失败不承担责任。</p>

      <h3>13. Changes to the Terms｜条款更新</h3>
      <p><b>EN —</b> We may update with an effective date; material changes will be highlighted. Continued use means acceptance.</p>
      <p><b>ZH —</b> 我们可能更新并标注生效日期；重大变更将显著提示；继续使用视为接受。</p>

      <h3>14. Governing Law & Jurisdiction｜适用法律与管辖</h3>
      <p><b>EN —</b> Singapore law; courts in Singapore have exclusive jurisdiction.</p>
      <p><b>ZH —</b> 受新加坡法律管辖，由新加坡法院专属管辖。</p>

      <h3>15. Notices & Miscellaneous｜通知与其他</h3>
      <p><b>EN —</b> Notices via postings; severability; no waiver; no assignment without consent; entire agreement.</p>
      <p><b>ZH —</b> 通过站内发布通知；适用可分割性、权利不弃、未经同意不得转让及完整协议。</p>
    </div>
  )
}

