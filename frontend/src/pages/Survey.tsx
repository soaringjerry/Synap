import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { listItems, submitBulk, seedSample, getScaleMeta, ItemOut, listProjectKeysPublic, submitE2EE, postConsentSign, participantSelfDelete, e2eeSelfDelete } from '../api/client'
import { e2eeInit, encryptForProject } from '../crypto/e2ee'
import { useTranslation } from 'react-i18next'
import { useToast } from '../components/Toast'

export function Survey() {
  const { scaleId = '' } = useParams()
  const nav = useNavigate()
  const { t, i18n } = useTranslation()
  const lang: 'en'|'zh' = i18n.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  const [consented, setConsented] = useState(false)
  const [consentConfig, setConsentConfig] = useState<{ version?: string, signature_required?: boolean, options?: { key:string; label_i18n?: Record<string,string>; required?: boolean }[] }|null>(null)
  const [consentChoices, setConsentChoices] = useState<Record<string, boolean>>({})
  const [sigChecked, setSigChecked] = useState(false)
  const [sigImage, setSigImage] = useState<string>('')
  const [consentId, setConsentId] = useState<string>('')
  const sigCanvasRef = useRef<HTMLCanvasElement|null>(null)
  const [items, setItems] = useState<ItemOut[]>([])
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [selfManage, setSelfManage] = useState<{exportUrl?: string; deleteUrl?: string; pid?: string; token?: string; rid?: string} | null>(null)
  const [loading, setLoading] = useState(false)
  const [consentEvidence, setConsentEvidence] = useState<any|null>(null)
  const [consentCustom, setConsentCustom] = useState('')
  const [points, setPoints] = useState<number>(5)
  const [collectEmail, setCollectEmail] = useState<'off'|'optional'|'required'>('optional')
  const [e2ee, setE2ee] = useState(false)
  const [metaReady, setMetaReady] = useState(false)
  const toast = useToast()

  async function loadMeta() {
    try {
      setMetaReady(false)
      // Force fresh meta to avoid stale cache after admin changes
      let meta: any
      try {
        const res = await fetch(`/api/scale/${encodeURIComponent(scaleId)}?ts=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(await res.text())
        meta = await res.json()
      } catch {
        meta = await getScaleMeta(scaleId)
      }
      const c = (meta.consent_i18n && (meta.consent_i18n[lang] || meta.consent_i18n['en'])) || ''
      setConsentCustom(c || '')
      setPoints(meta.points || 5)
      setCollectEmail((meta.collect_email as any) || 'optional')
      setE2ee(!!(meta as any).e2ee_enabled)
      const cc = meta.consent_config || null
      if (cc) {
        const sr = typeof cc.signature_required !== 'undefined' ? !!cc.signature_required : false
        setConsentConfig({ ...cc, signature_required: sr })
      } else {
        setConsentConfig(null)
      }
    } catch {}
    setMetaReady(true)
  }
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

  useEffect(()=>{ loadMeta() }, [scaleId, lang])
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
      const res = await postConsentSign({ scale_id: scaleId, version: consentConfig?.version || 'v1', locale: lang, choices: consentChoices, signed_at: evidence.ts, signature_kind: evidence.signature.kind, evidence: JSON.stringify(evidence) })
      if ((res as any)?.id) setConsentId((res as any).id)
    } catch {}
    // Store locally and continue; download will be optional after submit
    setConsentEvidence(evidence)
    setConsented(true)
  }

  function consentOptionLabel(opt: {key:string; label_i18n?:Record<string,string>}) {
    if (opt.label_i18n) return opt.label_i18n[lang] || opt.label_i18n['en']
    // fallback to i18n defaults
    return t(`survey.consent_opt.${opt.key}`) as string
  }

  function openPrintWindow(title: string, bodyHtml: string): boolean {
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
      <style>
        body{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif; color:#111; }
        .wrap{ max-width: 820px; margin: 24px auto; padding: 0 16px; }
        h1{ font-size: 20px; margin: 0 0 8px; }
        h2{ font-size: 16px; margin: 18px 0 8px; }
        .meta{ color:#555; font-size: 12px; margin-bottom: 8px; }
        table{ width:100%; border-collapse: collapse; }
        th, td{ border:1px solid #ddd; padding:8px; font-size: 13px; vertical-align: top; }
        th{ background:#f7f7f7; text-align:left; }
        .sig{ border:1px dashed #ccc; width: 100%; height: 120px; display: grid; place-items:center; margin-top:6px }
        .muted{ color:#666; font-size: 12px; }
      </style></head><body><div class="wrap">${bodyHtml}</div></body></html>`
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) return false
    try {
      w.document.open(); w.document.write(html); w.document.close()
      w.focus(); setTimeout(()=> { try { w.print() } catch {} }, 200)
      return true
    } catch {
      return false
    }
  }

  async function downloadConsentPDF() {
    if (!consentEvidence) return
    const ev = consentEvidence
    const title = (lang==='zh' ? '知情同意凭证' : 'Consent Receipt') + ` · ${ev.scale_id}`
    const opts = Object.entries(ev.options||{}).map(([k, v])=> `<tr><td>${k}</td><td>${v? (lang==='zh'?'已同意':'Yes') : (lang==='zh'?'不同意':'No')}</td></tr>`).join('')
    const sigBlock = ev.signature?.image ? `<img alt="signature" src="${ev.signature.image}" style="max-width:100%; max-height:120px; border:1px solid #ddd;"/>` : `<div class="sig">${lang==='zh'?'（无手写签名）':'(No drawn signature)'} · ${ev.signature?.kind||'none'}</div>`
    const body = `
      <h1>${title}</h1>
      <div class="meta">${lang==='zh'?'版本':'Version'} ${ev.version} · ${lang==='zh'?'语言':'Locale'} ${ev.locale} · ${new Date(ev.ts).toLocaleString()}</div>
      <h2>${lang==='zh'?'确认选项':'Confirmations'}</h2>
      <table><thead><tr><th>${lang==='zh'?'键名':'Key'}</th><th>${lang==='zh'?'选择':'Choice'}</th></tr></thead><tbody>${opts}</tbody></table>
      <h2>${lang==='zh'?'签名':'Signature'}</h2>
      ${sigBlock}
      <div class="muted" style="margin-top:12px">${lang==='zh'?'本文件用于参与者留存，非技术格式。':'This receipt is for participant records (human‑readable).'} · ID: ${ev.scale_id}</div>
    `
    const ok = openPrintWindow(title, body)
    if (!ok) {
      try {
        const blob = new Blob([`<meta charset='utf-8'>`+body], { type: 'text/html' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `consent_${scaleId}.html`
        a.click(); URL.revokeObjectURL(a.href)
        setMsg(t('survey.download_help')||'Popup blocked. An HTML copy was downloaded — open it and print to PDF.')
      } catch {}
    }
  }

  async function downloadDataPDF() {
    if (!selfManage?.exportUrl) return
    try {
      const res = await fetch(selfManage.exportUrl)
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      // Try to map item_id -> stem in current language
      const stemMap: Record<string,string> = {}
      for (const it of items) stemMap[it.id] = it.stem || it.id
      const rows = (json.responses||json.answers||[]).map((r:any)=> {
        const id = r.item_id || r.id
        const stem = stemMap[id] || id
        const val = r.raw ?? r.value ?? ''
        return `<tr><td>${stem}</td><td>${Array.isArray(val)? val.join(', ') : String(val)}</td></tr>`
      }).join('')
      const title = (lang==='zh'?'我的作答导出':'My Submission Export')
      const body = `
        <h1>${title}</h1>
        <div class="meta">${new Date().toLocaleString()} · ${lang==='zh'?'仅供个人留存':'For personal records'}</div>
        <table><thead><tr><th>${lang==='zh'?'题目':'Question'}</th><th>${lang==='zh'?'作答':'Answer'}</th></tr></thead><tbody>${rows}</tbody></table>
      `
      openPrintWindow(title, body)
    } catch(e:any) {
      setMsg(e.message||String(e))
    }
  }

  async function handleSelfDelete() {
    try {
      if (!selfManage?.deleteUrl && !(selfManage?.rid && selfManage?.token)) return
      if (!confirm(t('self_delete_confirm') || 'Delete my submission? This cannot be undone.')) return
      // Prefer explicit fields (E2EE submit provided rid/token)
      if (selfManage?.rid && selfManage?.token) {
        await e2eeSelfDelete(selfManage.rid, selfManage.token)
        setMsg(t('delete_success')||'Deleted successfully')
        setSelfManage(null)
        return
      }
      // Fallback: parse from URL (non‑E2EE)
      if (selfManage?.deleteUrl) {
        const u = new URL(selfManage.deleteUrl, window.location.origin)
        const pid = u.searchParams.get('pid') || ''
        const token = u.searchParams.get('token') || ''
        if (!pid || !token) throw new Error('Invalid self‑delete link')
        await participantSelfDelete(pid, token)
        setMsg(t('delete_success')||'Deleted successfully')
        setSelfManage(null)
      }
    } catch(e:any) {
      setMsg(e.message||String(e))
    }
  }

  if (!consented) {
    if (!metaReady) {
      return (
        <div className="card span-12">
          <h3 style={{marginTop:0}}>{t('survey.consent_title')}</h3>
          <div className="muted">{t('survey.loading')||'Loading items…'}</div>
        </div>
      )
    }
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
        {/* Signature (shown only when explicitly required) */}
        {consentConfig?.signature_required === true && (
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
            const sigReq = consentConfig?.signature_required === true
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
      {e2ee && (
        <div className="tile" style={{padding:8, marginTop:8}}>
          <div className="muted">{t('survey.e2ee_on') || 'This survey uses end‑to‑end encryption. Your answers are encrypted in your browser.'}</div>
        </div>
      )}
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
              if (!keys || !keys.length) throw new Error(t('e2ee.no_keys')||'End‑to‑end encryption keys are not configured for this project')
              await e2eeInit()
              const payload: any = { scale_id: scaleId, answers }
              if (collectEmail !== 'off') payload.email = email.trim()
              const enc = await encryptForProject(payload, scaleId, keys as any)
              const res = await submitE2EE({ scale_id: scaleId, ciphertext: enc.ciphertext, nonce: enc.nonce, enc_dek: enc.encDEK, aad_hash: enc.aad_hash, pmk_fingerprint: enc.pmk_fingerprint })
              setMsg(t('submit_success')||'Submitted successfully')
              toast.success(t('submit_success')||'Submitted successfully')
              setSelfManage({ exportUrl: res.self_export, deleteUrl: res.self_delete, rid: res.response_id, token: res.self_token })
            } else {
              const arr = Object.entries(answers).map(([item_id, raw])=>({item_id, raw}))
              const res = await submitBulk(scaleId, email.trim(), arr as any, { consent_id: consentId || undefined })
              setMsg(`Submitted ${res.count} answers.`)
              toast.success(t('submit_success')||'Submitted successfully')
              setSelfManage({ exportUrl: res.self_export, deleteUrl: res.self_delete })
            }
            setAnswers({})
          } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
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
            {!!consentEvidence && (
              <>
                <button className="btn" onClick={downloadConsentPDF}>{t('survey.download_consent_pdf')||'Download consent (PDF)'}</button>
                <button className="btn btn-ghost" onClick={()=>{
                  try {
                    const blob = new Blob([JSON.stringify(consentEvidence, null, 2)], { type: 'application/json' })
                    const a = document.createElement('a')
                    a.href = URL.createObjectURL(blob)
                    a.download = `consent_${scaleId}_${Date.now()}.json`
                    a.click()
                    URL.revokeObjectURL(a.href)
                  } catch {}
                }}>{t('survey.download_consent')||'Download consent (JSON)'}</button>
              </>
            )}
            {selfManage.exportUrl && !e2ee && (
              <>
                <button className="btn" onClick={downloadDataPDF}>{t('survey.download_data_pdf')||'Download my data (PDF)'}</button>
                <a className="btn btn-ghost" href={selfManage.exportUrl} target="_blank" rel="noreferrer">{t('survey.self_export')||'Export my data'}</a>
              </>
            )}
            {selfManage.deleteUrl && <button className="btn btn-ghost" onClick={handleSelfDelete}>{t('survey.self_delete')||'Delete my data'}</button>}
          </div>
        </div>
      )}
    </div>
  )
}
