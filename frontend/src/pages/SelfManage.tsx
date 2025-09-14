import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { participantSelfExport, participantSelfDelete, e2eeSelfExport, e2eeSelfDelete } from '../api/client'
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

  async function doExport() {
    setMsg('')
    setDownloading(true)
    try {
      if (e2ee) {
        const data = await e2eeSelfExport(rid, token)
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `e2ee_${rid}.json`
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
          <button className="btn" disabled={downloading} onClick={doExport}>{t('self.export')||'Download (JSON)'}</button>
          <button className="btn btn-ghost" disabled={deleting} onClick={doDelete}>{t('self.delete')||'Delete my data'}</button>
        </div>
      </div>
      {msg && <div className="muted" style={{marginTop:8}}>{msg}</div>}
    </div>
  )
}
