import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listItems, submitBulk, seedSample, getScaleMeta, ItemOut } from '../api/client'
import { useTranslation } from 'react-i18next'

export function Survey() {
  const { scaleId = '' } = useParams()
  const nav = useNavigate()
  const { t } = useTranslation()
  const [lang] = useState<string>(()=> new URLSearchParams(location.search).get('lang') || 'en')
  const [consented, setConsented] = useState(false)
  const [items, setItems] = useState<ItemOut[]>([])
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [consentCustom, setConsentCustom] = useState('')
  const [points, setPoints] = useState<number>(5)
  const [collectEmail, setCollectEmail] = useState<'off'|'optional'|'required'>('optional')

  async function loadOrSeed() {
    setLoading(true)
    setMsg('')
    try {
      // Load scale meta for consent
      try {
        const meta = await getScaleMeta(scaleId)
        const c = (meta.consent_i18n && (meta.consent_i18n[lang] || meta.consent_i18n['en'])) || ''
        setConsentCustom(c || '')
        setPoints(meta.points || 5)
        setCollectEmail((meta.collect_email as any) || 'optional')
      } catch {}
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
    let done = 0
    for (const it of items) {
      const v = answers[it.id]
      const t = it.type || 'likert'
      const has = (
        v !== undefined && v !== null &&
        ((t==='multiple' && Array.isArray(v) && v.length>0) ||
         (t!=='multiple' && String(v).length>0))
      )
      if (has) done++
    }
    return total ? Math.round((done/total)*100) : 0
  }, [items, answers])

  if (!consented) {
    return (
      <div className="card span-12">
        <h3 style={{marginTop:0}}>{t('survey.consent_title')}</h3>
        {consentCustom ? (
          <div style={{whiteSpace:'pre-wrap'}} className="muted consent-content">{consentCustom}</div>
        ) : (
          <ul>
            <li>{t('survey.consent_collect')}</li>
            <li>{t('survey.consent_use')}</li>
            <li>{t('survey.consent_retention')}</li>
            <li>{t('survey.consent_rights')}</li>
          </ul>
        )}
        <div className="cta-row" style={{marginTop:12}}>
          <button className="btn btn-primary" onClick={()=>setConsented(true)}>{t('survey.consent_agree')}</button>
          <button className="btn btn-ghost" onClick={()=>nav('/')}>{t('survey.consent_decline')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card span-12">
      <h3 style={{marginTop:0}}>{t('survey.title')}</h3>
      <div className="muted" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div>{t('survey.scale')} <b>{scaleId}</b></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:140, height:8, background:'rgba(255,255,255,0.08)', borderRadius:999}}>
            <div style={{width:`${progress}%`, height:'100%', background:'linear-gradient(90deg, #22d3ee, #a78bfa)', borderRadius:999}} />
          </div>
          <span>{progress}%</span>
        </div>
      </div>
      {collectEmail!=='off' && (
        <div className="item">
          <div className="label">{t('survey.email_optional')}{collectEmail==='required'?' *':''}</div>
          <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required={collectEmail==='required'} />
        </div>
      )}
      {loading && <div className="muted">{t('survey.loading')}</div>}
      {!loading && items.map(it=> {
        const t = it.type || 'likert'
        const v = answers[it.id]
        const set = (val:any)=> setAnswers(a=> ({...a,[it.id]: val}))
        return (
          <div key={it.id} className="item">
            <div className="label">{it.stem}{it.required?' *':''}</div>
            {/* Likert-like */}
            {t==='likert' && (
              <div className="scale">
                {Array.from({length: points}, (_,i)=> i+1).map(x=> (
                  <button key={x} className={`bubble ${v===x?'active':''}`} onClick={()=>set(x)}>{x}</button>
                ))}
              </div>
            )}
            {/* Single choice */}
            {t==='single' && (
              <div>{(it.options||[]).map(opt=> (
                <label key={opt} style={{display:'inline-flex',gap:6,marginRight:12}}>
                  <input className="radio" type="radio" name={`it_${it.id}`} checked={v===opt} onChange={()=>set(opt)} /> {opt}
                </label>
              ))}</div>
            )}
            {/* Multiple choice */}
            {t==='multiple' && (
              <div>{(it.options||[]).map(opt=> {
                const arr: string[] = Array.isArray(v)? v : []
                const on = arr.includes(opt)
                return (
                  <label key={opt} style={{display:'inline-flex',gap:6,marginRight:12}}>
                    <input className="checkbox" type="checkbox" checked={on} onChange={e=> {
                      const nv = e.target.checked ? [...arr, opt] : arr.filter(x=>x!==opt)
                      set(nv)
                    }} /> {opt}
                  </label>
                )
              })}</div>
            )}
            {/* Dropdown */}
            {t==='dropdown' && (
              <select className="select" value={v||''} onChange={e=>set(e.target.value)}>
                <option value="">--</option>
                {(it.options||[]).map(opt=> <option key={opt} value={opt}>{opt}</option>)}
              </select>
            )}
            {/* Rating numeric buttons */}
            {t==='rating' && (
              <div className="scale">
                {Array.from({length: (it.max||10) - (it.min||0) + 1}, (_,i)=> (it.min||0)+i).map(x=> (
                  <button key={x} className={`bubble ${v===x?'active':''}`} onClick={()=>set(x)}>{x}</button>
                ))}
              </div>
            )}
            {/* Numeric */}
            {t==='numeric' && (
              <input className="input" type="number" min={it.min} max={it.max} step={it.step||1} value={v??''} onChange={e=> set(e.target.value===''? '' : Number(e.target.value))} />
            )}
            {/* Slider */}
            {t==='slider' && (
              <input className="input" type="range" min={it.min||0} max={it.max||100} step={it.step||1} value={v??(it.min||0)} onChange={e=> set(Number(e.target.value))} />
            )}
            {/* Short/Long text */}
            {t==='short_text' && (
              <input className="input" type="text" placeholder={it.placeholder||''} value={v||''} onChange={e=> set(e.target.value)} />
            )}
            {t==='long_text' && (
              <textarea className="input" rows={5} placeholder={it.placeholder||''} value={v||''} onChange={e=> set(e.target.value)} />
            )}
            {/* Date/Time */}
            {t==='date' && (
              <input className="input" type="date" value={v||''} onChange={e=> set(e.target.value)} />
            )}
            {t==='time' && (
              <input className="input" type="time" value={v||''} onChange={e=> set(e.target.value)} />
            )}
          </div>
        )
      })}
      <div className="cta-row" style={{marginTop:12}}>
        <button className="btn btn-primary" disabled={!items.length || progress<100 || (collectEmail==='required' && !email.trim())} onClick={async()=>{
          try {
            const arr = Object.entries(answers).map(([item_id, raw])=>({item_id, raw}))
            const res = await submitBulk(scaleId, email.trim(), arr as any)
            setMsg(`Submitted ${res.count} answers.`)
            setAnswers({})
          } catch(e:any) { setMsg(e.message||String(e)) }
        }}>Submit</button>
        {scaleId.toUpperCase()==='SAMPLE' && (
          <button className="btn btn-ghost" onClick={loadOrSeed}>{t('survey.reload')}</button>
        )}
        <button className="btn btn-ghost" onClick={()=>{ setAnswers({}); setMsg('') }}>{t('survey.reset')}</button>
      </div>
      {msg && <div className="muted" style={{marginTop:8}}>{msg}</div>}
    </div>
  )
}
