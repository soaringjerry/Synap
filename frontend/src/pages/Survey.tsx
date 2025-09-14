import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listItems, submitBulk, seedSample, getScaleMeta, ItemOut, listProjectKeysPublic, submitE2EE, postConsentSign } from '../api/client'
import { e2eeInit, encryptForProject } from '../crypto/e2ee'
import { useTranslation } from 'react-i18next'

export function Survey() {
  const { scaleId = '' } = useParams()
  const nav = useNavigate()
  const { t } = useTranslation()
  const [lang] = useState<string>(()=> new URLSearchParams(location.search).get('lang') || 'en')
  const [consented, setConsented] = useState(false)
  const [consentConfig, setConsentConfig] = useState<{ version?: string, signature_required?: boolean, options?: { key:string; label_i18n?: Record<string,string>; required?: boolean }[] }|null>(null)
  const [consentChoices, setConsentChoices] = useState<Record<string, boolean>>({})
  const [sigChecked, setSigChecked] = useState(false)
  const [sigImage, setSigImage] = useState<string>('')
  const sigCanvasRef = useRef<HTMLCanvasElement|null>(null)
  const [items, setItems] = useState<ItemOut[]>([])
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [selfManage, setSelfManage] = useState<{exportUrl?: string; deleteUrl?: string; pid?: string; token?: string; rid?: string} | null>(null)
  const [loading, setLoading] = useState(false)
  const [consentCustom, setConsentCustom] = useState('')
  const [points, setPoints] = useState<number>(5)
  const [collectEmail, setCollectEmail] = useState<'off'|'optional'|'required'>('optional')
  const [e2ee, setE2ee] = useState(false)

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
        setE2ee(!!(meta as any).e2ee_enabled)
        setConsentConfig(meta.consent_config || null)
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

  function drawSigInit(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.lineCap = 'round'
    let drawing = false
    function pos(e: any){ const rect = canvas.getBoundingClientRect(); const x = (e.touches? e.touches[0].clientX : e.clientX) - rect.left; const y = (e.touches? e.touches[0].clientY : e.clientY) - rect.top; return {x,y} }
    function down(e:any){ drawing=true; const p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); e.preventDefault() }
    function move(e:any){ if(!drawing) return; const p=pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); e.preventDefault() }
    function up(e:any){ drawing=false; e.preventDefault() }
    canvas.addEventListener('mousedown',down); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',up)
    canvas.addEventListener('touchstart',down,{passive:false}); canvas.addEventListener('touchmove',move,{passive:false}); window.addEventListener('touchend',up)
  }

  async function handleConsentAgree() {
    // Build evidence JSON
    const evidence = {
      scale_id: scaleId,
      locale: lang,
      version: consentConfig?.version || 'v1',
      sections: ['purpose','risk','withdrawal','data_use','anonymity','contact'],
      options: consentChoices,
      signature: { kind: sigImage ? 'draw' : (sigChecked ? 'click' : 'none'), image: sigImage || undefined, required: !!consentConfig?.signature_required },
      ts: new Date().toISOString(),
      ua: (typeof navigator!=='undefined'? navigator.userAgent : '')
    }
    try {
      await postConsentSign({ scale_id: scaleId, version: consentConfig?.version || 'v1', locale: lang, choices: consentChoices, signed_at: evidence.ts, signature_kind: evidence.signature.kind, evidence: JSON.stringify(evidence) })
    } catch {}
    setConsented(true)
    // Offer download of JSON copy automatically
    const blob = new Blob([JSON.stringify(evidence,null,2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `consent_${scaleId}_${Date.now()}.json`; a.click(); URL.revokeObjectURL(a.href)
  }

  function consentOptionLabel(opt: {key:string; label_i18n?:Record<string,string>}) {
    if (opt.label_i18n) return opt.label_i18n[lang] || opt.label_i18n['en']
    // fallback to i18n defaults
    return t(`survey.consent_opt.${opt.key}`) as string
  }

  if (!consented) {
    return (
      <div className="card span-12">
        <h3 style={{marginTop:0}}>{t('survey.consent_title')}</h3>
        {/* Segmented sections */}
        <div className="item">
          <div className="label">{t('survey.sec_purpose_title')}</div>
          <div className="muted">{t('survey.sec_purpose_body')}</div>
        </div>
        <div className="item">
          <div className="label">{t('survey.sec_risk_title')}</div>
          <div className="muted">{t('survey.sec_risk_body')}</div>
        </div>
        <div className="item">
          <div className="label">{t('survey.sec_withdrawal_title')}</div>
          <div className="muted">{t('survey.sec_withdrawal_body')}</div>
        </div>
        <div className="item">
          <div className="label">{t('survey.sec_datause_title')}</div>
          <div className="muted">{t('survey.sec_datause_body')}</div>
        </div>
        <div className="item">
          <div className="label">{t('survey.sec_anonymity_title')}</div>
          <div className="muted">{t('survey.sec_anonymity_body')}</div>
        </div>
        <div className="item">
          <div className="label">{t('survey.sec_contact_title')}</div>
          <div className="muted">{t('survey.sec_contact_body')}</div>
        </div>
        {/* Custom consent text block if provided */}
        {consentCustom && (
          <div className="item">
            <div className="label">{t('consent_custom')}</div>
            <div className="muted" style={{whiteSpace:'pre-wrap'}}>{consentCustom}</div>
          </div>
        )}
        {/* Interactive options */}
        <div className="item">
          <div className="label">{t('survey.consent_options')}</div>
          {(consentConfig?.options||[
            { key:'recording', required:false },
            { key:'withdrawal', required:true },
            { key:'data_use', required:true },
          ]).map((opt:any)=> (
            <div key={opt.key} className="tile" style={{padding:8, marginTop:8}}>
              <div style={{display:'flex',alignItems:'center',gap:12, flexWrap:'wrap'}}>
                <div style={{minWidth:220}}><b>{consentOptionLabel(opt)}</b>{opt.required? ' *':''}</div>
                <label><input className="radio" type="radio" name={`opt_${opt.key}`} checked={!!consentChoices[opt.key]} onChange={()=> setConsentChoices(c=> ({...c, [opt.key]: true}))} /> {t('survey.yes')||'Yes'}</label>
                <label><input className="radio" type="radio" name={`opt_${opt.key}`} checked={!consentChoices[opt.key]} onChange={()=> setConsentChoices(c=> ({...c, [opt.key]: false}))} /> {t('survey.no')||'No'}</label>
              </div>
            </div>
          ))}
        </div>
        {/* Signature (optional if disabled) */}
        {!!(consentConfig?.signature_required ?? true) && (
          <div className="item">
            <div className="label">{t('survey.signature_title')||'Signature'}</div>
            <label style={{display:'inline-flex',gap:8,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={sigChecked} onChange={e=> setSigChecked(e.target.checked)} />{t('survey.signature_click')||'I agree (click to sign)'}</label>
            <div className="muted" style={{margin:'8px 0'}}>{t('survey.signature_or')||'or draw your signature below'}</div>
            <canvas ref={el=> { if (el && !sigCanvasRef.current) { sigCanvasRef.current = el; el.style.width='100%'; el.style.maxWidth='100%'; el.height=150; el.style.border='1px solid var(--border)';
              const resize=()=>{ const rect = el.getBoundingClientRect(); const dpr = window.devicePixelRatio||1; el.width = Math.floor(rect.width * dpr); }
              resize(); new ResizeObserver(resize).observe(el.parentElement||el); drawSigInit(el)
            } }} />
            <div className="cta-row" style={{marginTop:8}}>
              <button className="btn" onClick={()=> { if (sigCanvasRef.current) { const ctx = sigCanvasRef.current.getContext('2d')!; ctx.clearRect(0,0,sigCanvasRef.current.width, sigCanvasRef.current.height); setSigImage('') } }}>{t('survey.clear')||'Clear'}</button>
              <button className="btn" onClick={()=> { if (sigCanvasRef.current) { const url = sigCanvasRef.current.toDataURL('image/png'); setSigImage(url) } }}>{t('survey.save_signature')||'Save signature'}</button>
            </div>
          </div>
        )}
        <div className="muted" style={{marginTop:8}}>{t('survey.security_badges')||'Security: encrypted at rest, end‑to‑end encryption supported; designed for GDPR/PDPA compliance.'}</div>
        <div className="cta-row" style={{marginTop:12}}>
          <button className="btn btn-primary" disabled={(() => {
            // required options must be true, and at least one signature action
            const opts = consentConfig?.options||[{key:'withdrawal', required:true}, {key:'data_use', required:true}]
            for (const o of opts) if (o.required && !consentChoices[o.key]) return true
            const sigReq = consentConfig?.signature_required ?? true
            if (sigReq && !sigChecked && !sigImage) return true
            return false
          })()} onClick={handleConsentAgree}>{t('survey.consent_agree')}</button>
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
      <div className="sticky-actions cta-row" style={{marginTop:12}}>
        <button className="btn btn-primary" disabled={!items.length || progress<100 || (collectEmail==='required' && !email.trim())} onClick={async()=>{
          try {
            if (e2ee) {
              const { keys } = await listProjectKeysPublic(scaleId)
              if (!keys || !keys.length) throw new Error('No E2EE keys registered for this project')
              await e2eeInit()
              const payload: any = { scale_id: scaleId, answers }
              if (collectEmail !== 'off') payload.email = email.trim()
              const enc = await encryptForProject(payload, scaleId, keys as any)
              const res = await submitE2EE({ scale_id: scaleId, ciphertext: enc.ciphertext, nonce: enc.nonce, enc_dek: enc.encDEK, aad_hash: enc.aad_hash, pmk_fingerprint: enc.pmk_fingerprint })
              setMsg(`Submitted (E2EE).`)
              setSelfManage({ exportUrl: res.self_export, deleteUrl: res.self_delete, rid: res.response_id, token: res.self_token })
            } else {
              const arr = Object.entries(answers).map(([item_id, raw])=>({item_id, raw}))
              const res = await submitBulk(scaleId, email.trim(), arr as any)
              setMsg(`Submitted ${res.count} answers.`)
              setSelfManage({ exportUrl: res.self_export, deleteUrl: res.self_delete })
            }
            setAnswers({})
          } catch(e:any) { setMsg(e.message||String(e)) }
        }}>Submit</button>
        {scaleId.toUpperCase()==='SAMPLE' && (
          <button className="btn btn-ghost" onClick={loadOrSeed}>{t('survey.reload')}</button>
        )}
        <button className="btn btn-ghost" onClick={()=>{ setAnswers({}); setMsg('') }}>{t('survey.reset')}</button>
      </div>
      {msg && <div className="muted" style={{marginTop:8}}>{msg}</div>}
      {selfManage && (
        <div className="tile" style={{marginTop:8, padding:12}}>
          <div style={{fontWeight:600}}>{t('survey.self_manage')||'Manage your data'}</div>
          <div className="muted" style={{marginTop:4}}>{t('survey.self_manage_hint')||'You can export or delete your submission using the links below. Keep them safe.'}</div>
          <div className="cta-row" style={{marginTop:8, display:'flex', gap:8, flexWrap:'wrap'}}>
            {selfManage.exportUrl && <a className="btn" href={selfManage.exportUrl} target="_blank" rel="noreferrer">{t('survey.self_export')||'Export my data'}</a>}
            {selfManage.deleteUrl && <a className="btn btn-ghost" href={selfManage.deleteUrl} target="_blank" rel="noreferrer">{t('survey.self_delete')||'Delete my data'}</a>}
          </div>
        </div>
      )}
    </div>
  )
}
