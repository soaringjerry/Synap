import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function Auth() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [mode, setMode] = useState<'login'|'register'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenant, setTenant] = useState('')
  const [msg, setMsg] = useState('')

  async function submit() {
    setMsg('')
    try {
      const url = mode === 'register' ? '/api/auth/register' : '/api/auth/login'
      const body: any = { email, password }
      if (mode === 'register') body.tenant_name = tenant
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data || res.statusText)
      localStorage.setItem('token', data.token)
      nav('/admin')
    } catch (e: any) {
      setMsg(e.message || String(e))
    }
  }

  return (
    <div className="container">
      <div className="hero">
        <div className="glitch" data-text={t('admin_access')}>{t('admin_access')}</div>
        <div className="muted">{t('admin_sub')}</div>
      </div>
      <div className="row">
        <section className="card span-6">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="neon-btn" onClick={() => setMode('register')} aria-pressed={mode==='register'}>{t('register')}</button>
            <button className="neon-btn" onClick={() => setMode('login')} aria-pressed={mode==='login'}>{t('login')}</button>
          </div>
          <div className="item"><div className="label">{t('email')}</div>
            <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="item"><div className="label">{t('password')}</div>
            <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          </div>
          {mode==='register' && (
            <div className="item"><div className="label">{t('tenant_name')}</div>
              <input className="input" value={tenant} onChange={e=>setTenant(e.target.value)} placeholder="Lab / Team" />
            </div>
          )}
          <div style={{ height: 12 }} />
          <button className="neon-btn" onClick={submit}>{mode==='register'?t('create_account'):t('login')}</button>
          {msg && <div className="muted" style={{ marginTop:8 }}>{msg}</div>}
        </section>
      </div>
    </div>
  )
}
