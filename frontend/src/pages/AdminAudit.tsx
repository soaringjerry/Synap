import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adminListScales } from '../api/client'

type AuditEntry = { time: string; actor: string; action: string; target: string; note?: string }

export function AdminAudit() {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [scaleId, setScaleId] = useState<string>('')
  const [scales, setScales] = useState<{ id: string; name_i18n?: Record<string,string> }[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function loadScales() {
    try {
      const { scales } = await adminListScales()
      setScales(scales || [])
    } catch (e:any) { setErr(e.message||String(e)) }
  }

  async function loadAudit(sel?: string) {
    setLoading(true)
    setErr('')
    try {
      const url = sel ? `/api/admin/audit?scale_id=${encodeURIComponent(sel)}` : '/api/admin/audit'
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || res.statusText)
      setEntries((data||[]).map((e:any)=>({
        time: e.time || e.ts || '',
        actor: e.actor,
        action: e.action,
        target: e.target,
        note: e.note,
      })))
    } catch (e:any) {
      setErr(e.message||String(e))
    } finally { setLoading(false) }
  }

  useEffect(()=>{ loadScales(); loadAudit('') },[])

  const onFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sel = e.target.value
    setScaleId(sel)
    loadAudit(sel)
  }

  const title = useMemo(()=>{
    const s = scales.find(s=> s.id===scaleId)
    const base = t('admin.audit_log') || 'Audit Log'
    if (!s) return base
    const name = s.name_i18n?.en || s.name_i18n?.zh || s.id
    return `${base} · ${name}`
  }, [scales, scaleId])

  return (
    <div className="container">
      <div className="hero"><div className="glitch" data-text={title}>{title}</div></div>
      <div className="row">
        <section className="card span-12">
          <div style={{display:'flex', gap:12, alignItems:'center'}}>
            <label>
              <span style={{marginRight:8}}>{t('admin.audit_filter')||'Filter by Scale'}</span>
              <select className="input" value={scaleId} onChange={onFilter}>
                <option value="">{t('admin.audit_all_scales')||'All scales'}</option>
                {scales.map(s=> <option key={s.id} value={s.id}>{s.id}</option>)}
              </select>
            </label>
            {loading && <div className="muted">Loading…</div>}
          </div>
          <div style={{overflowX:'auto', marginTop:12}}>
            <table className="table" style={{width:'100%'}}>
              <thead>
                <tr>
                  <th style={{textAlign:'left'}}>{t('admin.audit_time')||'Time (UTC)'}</th>
                  <th style={{textAlign:'left'}}>{t('admin.audit_actor')||'Actor'}</th>
                  <th style={{textAlign:'left'}}>{t('admin.audit_action')||'Action'}</th>
                  <th style={{textAlign:'left'}}>{t('admin.audit_target')||'Target'}</th>
                  <th style={{textAlign:'left'}}>{t('admin.audit_note')||'Note'}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i)=> (
                  <tr key={i}>
                    <td>{(e.time||'').replace('T',' ').replace('Z','')}</td>
                    <td>{e.actor}</td>
                    <td>{e.action}</td>
                    <td>{e.target}</td>
                    <td>{e.note||''}</td>
                  </tr>
                ))}
                {entries.length===0 && !loading && (
                  <tr><td colSpan={5} className="muted">{t('admin.audit_empty')||'No audit entries'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {err && <div className="muted" style={{marginTop:8}}>{err}</div>}
        </section>
      </div>
    </div>
  )
}
