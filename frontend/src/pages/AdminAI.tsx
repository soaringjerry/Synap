import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../components/Toast'
import { adminGetAIConfig, adminUpdateAIConfig } from '../api/client'

export function AdminAI() {
  const { t } = useTranslation()
  const toast = useToast()
  const [cfg, setCfg] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setMsg('')
    try { const c = await adminGetAIConfig(); setCfg(c) } catch(e:any) { setMsg(e.message||String(e)) }
  }
  useEffect(()=>{ load() }, [])

  async function save() {
    setMsg('')
    try {
      setSaving(true)
      await adminUpdateAIConfig({ openai_key: cfg.openai_key, openai_base: cfg.openai_base, allow_external: !!cfg.allow_external, store_logs: !!cfg.store_logs })
      setMsg(t('saved') as string)
      toast.success(t('save_success')||t('saved')||'Saved')
    } catch(e:any) { setMsg(e.message||String(e)) } finally { setSaving(false) }
  }

  if (!cfg) return <div className="card span-12"><div className="muted">{t('loading')}…</div>{msg && <div className="muted">{msg}</div>}</div>

  return (
    <div className="container">
      <div className="hero">
        <div className="glitch" data-text="AI Tools">AI Tools</div>
        <div className="muted">Configure provider and privacy options</div>
      </div>
      <div className="row">
        <section className="card span-8">
          <h3 style={{marginTop:0}}>OpenAI Provider</h3>
          <div className="item"><div className="label">API Base</div>
            <input className="input" placeholder="https://api.openai.com" value={cfg.openai_base||''} onChange={e=> setCfg((c:any)=> ({...c, openai_base: e.target.value}))} />
          </div>
          <div className="item"><div className="label">API Key</div>
            <input className="input" type="password" placeholder="sk-..." value={cfg.openai_key||''} onChange={e=> setCfg((c:any)=> ({...c, openai_key: e.target.value}))} />
          </div>
          <div className="item"><label><input className="checkbox" type="checkbox" checked={!!cfg.allow_external} onChange={e=> setCfg((c:any)=> ({...c, allow_external: e.target.checked}))} /> Allow external AI (OpenAI)</label></div>
          <div className="item"><label><input className="checkbox" type="checkbox" checked={!!cfg.store_logs} onChange={e=> setCfg((c:any)=> ({...c, store_logs: e.target.checked}))} /> Store prompts/results on server (for audit)</label></div>
          <div className="cta-row">
            <button className="btn btn-primary" onClick={save} disabled={saving}>{t('save')}</button>
          </div>
          {msg && <div className="muted" style={{marginTop:8}}>{msg}</div>}
        </section>
      </div>
    </div>
  )
}
