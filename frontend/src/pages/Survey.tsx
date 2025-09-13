import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listItems, submitBulk } from '../api/client'

export function Survey() {
  const { scaleId = '' } = useParams()
  const nav = useNavigate()
  const [lang] = useState<string>(()=> new URLSearchParams(location.search).get('lang') || 'en')
  const [consented, setConsented] = useState(false)
  const [items, setItems] = useState<{id:string; stem:string; reverse_scored?: boolean}[]>([])
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [msg, setMsg] = useState('')

  useEffect(()=>{ if (consented) { listItems(scaleId, lang).then(d=> setItems(d.items)).catch(()=>setMsg('Failed to load items')) } }, [consented, scaleId, lang])

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
      {items.map(it=> (
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
        <button className="btn btn-primary" onClick={async()=>{
          try {
            const arr = Object.entries(answers).map(([item_id, raw_value])=>({item_id, raw_value}))
            const res = await submitBulk(scaleId, '', arr as any)
            setMsg(`Submitted ${res.count} answers.`)
          } catch(e:any) { setMsg(e.message||String(e)) }
        }}>Submit</button>
      </div>
      {msg && <div className="muted" style={{marginTop:8}}>{msg}</div>}
    </div>
  )
}

