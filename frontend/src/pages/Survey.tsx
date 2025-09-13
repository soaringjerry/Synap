import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listItems, submitBulk, seedSample } from '../api/client'

export function Survey() {
  const { scaleId = '' } = useParams()
  const nav = useNavigate()
  const [lang] = useState<string>(()=> new URLSearchParams(location.search).get('lang') || 'en')
  const [consented, setConsented] = useState(false)
  const [items, setItems] = useState<{id:string; stem:string; reverse_scored?: boolean}[]>([])
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadOrSeed() {
    setLoading(true)
    setMsg('')
    try {
      const d = await listItems(scaleId, lang)
      if (d.items.length === 0 && scaleId.toUpperCase() === 'SAMPLE') {
        await seedSample()
        const s = await listItems(scaleId, lang)
        setItems(s.items)
      } else {
        setItems(d.items)
      }
    } catch (e:any) { setMsg(e.message||String(e)) }
    setLoading(false)
  }

  useEffect(()=>{ if (consented) { loadOrSeed() } }, [consented, scaleId, lang])

  const progress = useMemo(()=>{
    const total = items.length || 0
    const done = Object.keys(answers).filter(k=> answers[k]>0).length
    return total ? Math.round((done/total)*100) : 0
  }, [items, answers])

  if (!consented) {
    return (
      <div className="card span-12">
        <h3 style={{marginTop:0}}>Research Participant Consent</h3>
        <ul>
          <li>What we collect: your responses (and optional email if provided).</li>
          <li>How we use: academic research and aggregate statistics only.</li>
          <li>Retention: limited duration; you may request deletion.</li>
          <li>Rights: access / rectification / deletion / portability.</li>
        </ul>
        <div className="cta-row" style={{marginTop:12}}>
          <button className="btn btn-primary" onClick={()=>setConsented(true)}>Agree and continue</button>
          <button className="btn btn-ghost" onClick={()=>nav('/')}>Decline</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card span-12">
      <h3 style={{marginTop:0}}>Survey</h3>
      <div className="muted" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div>Scale: <b>{scaleId}</b></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:140, height:8, background:'rgba(255,255,255,0.08)', borderRadius:999}}>
            <div style={{width:`${progress}%`, height:'100%', background:'linear-gradient(90deg, #22d3ee, #a78bfa)', borderRadius:999}} />
          </div>
          <span>{progress}%</span>
        </div>
      </div>
      <div className="item">
        <div className="label">Email (optional)</div>
        <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      {loading && <div className="muted">Loading items…</div>}
      {!loading && items.map(it=> (
        <div key={it.id} className="item">
          <div className="label">{it.stem}</div>
          <div className="scale">
            {[1,2,3,4,5].map(v=> (
              <button key={v} className={`bubble ${answers[it.id]===v?'active':''}`} onClick={()=>setAnswers(a=>({...a,[it.id]:v}))}>{v}</button>
            ))}
          </div>
        </div>
      ))}
      <div className="cta-row" style={{marginTop:12}}>
        <button className="btn btn-primary" disabled={!items.length || progress<100} onClick={async()=>{
          try {
            const arr = Object.entries(answers).map(([item_id, raw_value])=>({item_id, raw_value}))
            const res = await submitBulk(scaleId, email.trim(), arr as any)
            setMsg(`Submitted ${res.count} answers.`)
            setAnswers({})
          } catch(e:any) { setMsg(e.message||String(e)) }
        }}>Submit</button>
        {scaleId.toUpperCase()==='SAMPLE' && (
          <button className="btn btn-ghost" onClick={loadOrSeed}>Reload items</button>
        )}
        <button className="btn btn-ghost" onClick={()=>{ setAnswers({}); setMsg('') }}>Reset</button>
      </div>
      {msg && <div className="muted" style={{marginTop:8}}>{msg}</div>}
    </div>
  )
}
