import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { participantSelfExport, participantSelfDelete, e2eeSelfDelete } from '../api/client'
import { useToast } from '../components/Toast'

export function SelfManage() {
  const [sp] = useSearchParams()
  const pid = sp.get('pid') || ''
  const rid = sp.get('response_id') || ''
  const token = sp.get('token') || ''
  const e2ee = !!rid
  const { t } = useTranslation()
  const toast = useToast()
  const [msg, setMsg] = React.useState('')
  const [downloading, setDownloading] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const url = React.useMemo(() => window.location.href, [])

  // Try to load context (consent evidence, stems) stored by Survey on redirect
  const ctx = React.useMemo(() => {
    try {
      const k = `synap_self_ctx_${rid || pid}_${token}`
      const s = sessionStorage.getItem(k)
      return s ? JSON.parse(s) : null
    } catch { return null }
  }, [pid, rid, token])

  function openPrintWindow(title: string, bodyHtml: string): boolean {
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
      <style>
        @page { margin: 16mm; }
        body{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif; color:#111; }
        .wrap{ max-width: 820px; margin: 24px auto; padding: 0 16px; }
        h1{ font-size: 20px; margin: 0 0 8px; }
        h2{ font-size: 16px; margin: 18px 0 8px; }
        .meta{ color:#555; font-size: 12px; margin-bottom: 8px; }
        table{ width:100%; border-collapse: collapse; }
        th, td{ border:1px solid #ddd; padding:8px; font-size: 13px; vertical-align: top; page-break-inside: avoid; }
        th{ background:#f7f7f7; text-align:left; }
      </style>
      <script>window.onload = function(){ setTimeout(function(){ try{ window.print(); }catch(e){} }, 200); };</script>
      </head><body><div class="wrap">${bodyHtml}</div></body></html>`
    try {
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (!w) { URL.revokeObjectURL(url); return false }
      setTimeout(()=> URL.revokeObjectURL(url), 60_000)
      return true
    } catch { return false }
  }

  async function downloadConsentPDF() {
    if (!ctx?.consentEvidence) return
    const lang = (ctx.lang || 'en').toLowerCase().startsWith('zh')? 'zh' : 'en'
    const ev = ctx.consentEvidence
    const idText = rid || pid
    const title = (lang==='zh' ? '知情同意凭证' : 'Consent Receipt') + (idText? ` · ${idText}` : '')
    const labelOf = (k: string) => {
      const fb = (lang==='zh'? '我理解/同意' : 'Confirm')
      return (k==='withdrawal')? (lang==='zh'?'我理解我可以随时撤回':'I understand I can withdraw at any time')
        : (k==='data_use')? (lang==='zh'?'我理解我的数据仅用于学术/汇总用途':'I understand my data is for academic/aggregate use only')
        : (k==='recording')? (lang==='zh'?'我同意在适用时进行录音/录像':'I consent to audio/video recording where applicable')
        : `${fb}: ${k}`
    }
    const rows = Object.entries(ev.options||{}).map(([k,v])=> `<tr><td>${labelOf(k)}</td><td>${v? (lang==='zh'?'已同意':'Yes') : (lang==='zh'?'不同意':'No')}</td></tr>`).join('')
    const body = `<h1>${title}</h1><div class="meta">${idText? `ID: ${idText}`:''}</div><table><thead><tr><th>${lang==='zh'?'条目':'Item'}</th><th>${lang==='zh'?'选择':'Choice'}</th></tr></thead><tbody>${rows}</tbody></table>`
    openPrintWindow(title, body)
  }

  async function downloadDataPDF() {
    try {
      const lang = (ctx?.lang || 'en').toLowerCase().startsWith('zh')? 'zh' : 'en'
      const data = await participantSelfExport(pid, token)
      const stems: Record<string,string> = (ctx?.stems || {})
      const rows = (data.responses||[]).map((r:any)=> {
        const id = r.item_id || r.id
        const stem = stems[id] || id
        const val = r.raw_json || r.raw_value || r.score_value || ''
        return `<tr><td>${stem}</td><td>${typeof val==='string'? val : JSON.stringify(val)}</td></tr>`
      }).join('')
      const title = (lang==='zh'?'我的作答导出':'My Submission Export')
      const body = `<h1>${title}</h1><table><thead><tr><th>${lang==='zh'?'题目':'Question'}</th><th>${lang==='zh'?'作答':'Answer'}</th></tr></thead><tbody>${rows}</tbody></table>`
      openPrintWindow(title, body)
    } catch (e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }

  async function doExport() {
    setMsg('')
    setDownloading(true)
    try {
      if (e2ee) {
        if (!ctx?.answers) {
          const msgText = t('self.e2ee_export_session_only') || 'Plaintext export is only available immediately after submission in this browser session.'
          setMsg(msgText)
          toast.error(msgText)
          return
        }
        const payload = {
          scale_id: ctx.scaleId || undefined,
          response_id: rid || ctx.responseId,
          participant_id: ctx.participantId || pid || undefined,
          submitted_at: ctx.submittedAt || undefined,
          lang: ctx.lang || undefined,
          answers: ctx.answers,
          stems: ctx.stems,
          consent: ctx.consentEvidence,
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `submission_${rid || ctx.responseId || 'e2ee'}.json`
        a.click(); URL.revokeObjectURL(a.href)
      } else {
        const data = await participantSelfExport(pid, token)
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `submission_${pid}.json`
        a.click(); URL.revokeObjectURL(a.href)
      }
      toast.success(t('submit_success')||'Done')
    } catch (e: any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) } finally { setDownloading(false) }
  }

  async function doDelete() {
    if (!confirm(t('self_delete_confirm')||'Delete my submission? This cannot be undone.')) return
    setMsg('')
    setDeleting(true)
    try {
      if (e2ee) await e2eeSelfDelete(rid, token)
      else await participantSelfDelete(pid, token)
      toast.success(t('delete_success')||'Deleted')
    } catch (e: any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) } finally { setDeleting(false) }
  }

  if (!token || (!pid && !rid)) {
    return (
      <div className="card span-12">
        <h3 style={{marginTop:0}}>{t('self.title')||'Manage My Data'}</h3>
        <div className="muted">{t('self.invalid')||'Invalid or missing parameters.'}</div>
      </div>
    )
  }

  const isE2EEExportAvailable = !e2ee || !!ctx?.answers

  return (
    <div className="card span-12">
      <h3 style={{marginTop:0}}>{t('self.title')||'Manage My Data'}</h3>
      <div className="muted">{t('self.desc')||'Use this page to export or delete your submission.'}</div>
      <div className="tile" style={{marginTop:8, padding:12}}>
        <div className="item"><div className="label">{t('self.link')||'Link'}</div>
          <div className="cta-row"><input className="input" readOnly value={url} />
            <button className="btn" onClick={async()=>{ try { await navigator.clipboard.writeText(url); toast.success(t('copied')||'Copied') } catch {} }}>{t('copy')||'Copy'}</button>
          </div>
        </div>
        <div className="cta-row" style={{marginTop:8}}>
          <button className="btn" disabled={downloading || !isE2EEExportAvailable} onClick={doExport}>{t('self.export')||'Download (JSON)'}</button>
          {!e2ee && <button className="btn" onClick={downloadDataPDF}>{t('survey.download_data_pdf')||'Download my data (PDF)'}</button>}
          {ctx?.consentEvidence && <button className="btn" onClick={downloadConsentPDF}>{t('survey.download_consent_pdf')||'Download consent (PDF)'}</button>}
          <button className="btn btn-ghost" disabled={deleting} onClick={doDelete}>{t('self.delete')||'Delete my data'}</button>
        </div>
      </div>
      {msg && <div className="muted" style={{marginTop:8}}>{msg}</div>}
    </div>
  )
}
