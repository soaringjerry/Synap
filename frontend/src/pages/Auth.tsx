import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function Auth() {
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
        <div className="glitch" data-text="Admin Access">Admin Access</div>
        <div className="muted">Create surveys, manage items, export data</div>
      </div>
      <div className="row">
        <section className="card span-6">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="neon-btn" onClick={() => setMode('register')} aria-pressed={mode==='register'}>Register</button>
            <button className="neon-btn" onClick={() => setMode('login')} aria-pressed={mode==='login'}>Login</button>
          </div>
          <div className="item">
            <div className="label">Email</div>
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'inherit' }}/>
          </div>
          <div className="item">
            <div className="label">Password</div>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'inherit' }}/>
          </div>
          {mode==='register' && (
            <div className="item">
              <div className="label">Tenant Name</div>
              <input value={tenant} onChange={e=>setTenant(e.target.value)} placeholder="Lab / Team" style={{ width:'100%', padding:10, borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'inherit' }}/>
            </div>
          )}
          <div style={{ height: 12 }} />
          <button className="neon-btn" onClick={submit}>{mode==='register'?'Create account':'Login'}</button>
          {msg && <div className="muted" style={{ marginTop:8 }}>{msg}</div>}
        </section>
      </div>
    </div>
  )
}

