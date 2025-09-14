import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { adminListScales, adminCreateScale, adminAddProjectKey, adminDeleteScale } from '../api/client'
import * as sodium from 'libsodium-wrappers'
import { useToast } from '../components/Toast'

export function Admin() {
  const { t } = useTranslation()
  const toast = useToast()
  const [scales, setScales] = useState<any[]>([])
  const [nameEn, setNameEn] = useState('')
  const [nameZh, setNameZh] = useState('')
  const [points, setPoints] = useState(5)
  const [e2ee, setE2ee] = useState(true)
  const [region, setRegion] = useState<'auto'|'gdpr'|'pipl'|'pdpa'|'ccpa'>('auto')
  const [keyMethod, setKeyMethod] = useState<'upload'|'generate'>('generate')
  const [pub, setPub] = useState('')
  const [pass, setPass] = useState('')
  const [warn, setWarn] = useState('')
  // Consent settings at creation
  const [consentVersion, setConsentVersion] = useState('v1')
  const [consentTextEn, setConsentTextEn] = useState('')
  const [consentTextZh, setConsentTextZh] = useState('')
  const [signatureRequired, setSignatureRequired] = useState(true)
  const [consentOptions, setConsentOptions] = useState<{ key:string; required:boolean; en?:string; zh?:string }[]>([
    { key:'recording', required:false },
    { key:'withdrawal', required:true },
    { key:'data_use', required:true },
  ])

  function toAB(x: Uint8Array | ArrayBuffer) { return x instanceof Uint8Array ? x.slice(0).buffer : (x as ArrayBuffer).slice(0) }
  const [showAdvancedConsent, setShowAdvancedConsent] = useState(false)
  function getOpt(key:string){ return consentOptions.find(o=> o.key===key) }
  function setOptRequired(key:string, v:boolean){
    setConsentOptions(list=> {
      const idx = list.findIndex(o=> o.key===key)
      if (idx===-1) return [...list, { key, required: v }]
      const a=[...list]; a[idx] = { ...a[idx], required: v }; return a
    })
  }
  function applyConsentPreset(preset: 'minimal'|'recommended'|'strict'){
    if (preset==='minimal'){
      setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:false}])
      setSignatureRequired(false)
    } else if (preset==='recommended'){
      setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:false}])
      setSignatureRequired(true)
    } else {
      setConsentOptions([{key:'withdrawal',required:true},{key:'data_use',required:true},{key:'recording',required:true}])
      setSignatureRequired(true)
    }
  }
  async function deriveKey(pass: string, salt: Uint8Array) {
    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pass).buffer, 'PBKDF2', false, ['deriveKey'])
    return crypto.subtle.deriveKey({ name:'PBKDF2', salt: toAB(salt), iterations: 120000, hash: 'SHA-256' }, keyMaterial, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt'])
  }
  function b64(ab: ArrayBuffer | Uint8Array) { const u8 = ab instanceof Uint8Array ? ab : new Uint8Array(ab); let s=''; for (let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]); return btoa(s) }
  function fromB64(s: string) { const bin=atob(s); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u }
  async function sha256b64(u8: Uint8Array) { const d=await crypto.subtle.digest('SHA-256', toAB(u8)); return b64(d) }
  const [msg, setMsg] = useState('')

  async function loadScales() {
    try {
      const { scales } = await adminListScales()
      setScales(scales)
    } catch (e: any) { setMsg(e.message||String(e)) }
  }
  useEffect(() => { loadScales() }, [])

  async function createScale() {
    setMsg('')
    try {
      // Pre-validate and prepare key material when E2EE is ON
      let prepared: null | { algorithm: 'x25519+xchacha20'|'rsa+aesgcm'; public_key: string; fingerprint: string; download?: Blob } = null
      if (e2ee) {
        let algorithm: 'x25519+xchacha20'|'rsa+aesgcm' = 'x25519+xchacha20'
        let public_key = pub.trim()
        let fingerprint = ''
        if (keyMethod === 'generate') {
          if (!pass) throw new Error('Enter a passphrase for local private key')
          await sodium.ready
          const kp = sodium.crypto_kx_keypair()
          const salt = crypto.getRandomValues(new Uint8Array(16))
          const key = await deriveKey(pass, salt)
          const iv = crypto.getRandomValues(new Uint8Array(12))
          const enc = await crypto.subtle.encrypt({ name:'AES-GCM', iv: toAB(iv) }, key, kp.privateKey.buffer)
          const pubB64 = b64(kp.publicKey)
          fingerprint = await sha256b64(kp.publicKey)
          const blob = { v:1, alg:'x25519', enc_priv: b64(enc), iv: b64(iv), salt: b64(salt), pub: pubB64, fp: fingerprint }
          localStorage.setItem('synap_pmk', JSON.stringify(blob))
          public_key = pubB64
          prepared = { algorithm, public_key, fingerprint, download: new Blob([JSON.stringify(blob, null, 2)], { type: 'application/json' }) }
        } else {
          if (!public_key) throw new Error('Paste a public key')
          if (public_key.includes('BEGIN PUBLIC KEY')) algorithm = 'rsa+aesgcm'
          if (algorithm === 'x25519+xchacha20') fingerprint = await sha256b64(fromB64(public_key))
          else fingerprint = await sha256b64(new TextEncoder().encode(public_key))
          prepared = { algorithm, public_key, fingerprint }
        }
      }
      const options = consentOptions.map(o=> ({ key:o.key.trim(), required: !!o.required, label_i18n: { en: o.en || undefined, zh: o.zh || undefined } }))
      const body: any = { name_i18n: { en: nameEn, zh: nameZh }, points, e2ee_enabled: e2ee, region }
      if (consentTextEn || consentTextZh) body.consent_i18n = { en: consentTextEn || undefined, zh: consentTextZh || undefined }
      body.consent_config = { version: consentVersion, options, signature_required: !!signatureRequired }
      const created = await adminCreateScale(body as any)
      if (e2ee && prepared) {
        try {
          await adminAddProjectKey(created.id, { alg: prepared.algorithm, kdf: 'hkdf-sha256', public_key: prepared.public_key, fingerprint: prepared.fingerprint })
          if (prepared.download) {
            const a = document.createElement('a'); a.href = URL.createObjectURL(prepared.download); a.download = `synap_pmk_${created.id}.json`; a.click(); URL.revokeObjectURL(a.href)
            setWarn('Private key encrypted and stored locally. Download and keep it safe — losing it means permanent data loss.')
          }
        } catch (e:any) {
          // rollback to avoid half-configured E2EE project with no keys
          try { await adminDeleteScale(created.id) } catch {}
          throw e
        }
      }
      toast.success(t('create_success')||'Created successfully')
      setNameEn(''); setNameZh(''); setPoints(5); setPub(''); setPass(''); setKeyMethod('generate'); setWarn('');
      setConsentVersion('v1'); setConsentTextEn(''); setConsentTextZh(''); setSignatureRequired(true);
      setConsentOptions([{key:'recording',required:false},{key:'withdrawal',required:true},{key:'data_use',required:true}])
      loadScales()
    } catch (e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }
  function shareLink(id: string, lang?: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/survey/${encodeURIComponent(id)}${lang?`?lang=${lang}`:''}`
  }
  async function copyLink(id: string) {
    try {
      const url = shareLink(id)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setMsg(t('copied') as string)
        toast.success(t('copied')||'Copied')
      } else {
        setMsg(url)
      }
    } catch (e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
  }
  // Item creation is done within per-scale management page now.

  return (
    <div className="container">
      <div className="hero">
        <div className="glitch" data-text={t('admin_console')}>{t('admin_console')}</div>
        <div className="muted">{t('admin_console_sub')}</div>
      </div>
      <div className="row">
        <section className="card span-12">
          <h3 style={{marginTop:0}}>{t('create_scale')}</h3>
          <div className="row">
            <div className="card span-6">
              <h4 style={{marginTop:0}}>Scale Basics</h4>
              <div className="item"><div className="label">{t('name_en')}</div><input className="input" value={nameEn} onChange={e=>setNameEn(e.target.value)} /></div>
              <div className="item"><div className="label">{t('name_zh')}</div><input className="input" value={nameZh} onChange={e=>setNameZh(e.target.value)} /></div>
              <div className="item"><div className="label">{t('points')}</div><input className="input" type="number" min={2} max={9} value={points} onChange={e=>setPoints(parseInt(e.target.value||'5'))} /></div>
              <div className="item"><div className="label">{t('e2ee.region')||'Region'}</div>
                <select className="select" value={region} onChange={e=> setRegion(e.target.value as any)}>
                  <option value="auto">auto</option>
                  <option value="gdpr">gdpr</option>
                  <option value="pipl">pipl</option>
                  <option value="pdpa">pdpa</option>
                  <option value="ccpa">ccpa</option>
                </select>
              </div>
              <div className="item"><label><input className="checkbox" type="checkbox" checked={e2ee} onChange={e=> setE2ee(e.target.checked)} /> {t('e2ee.enable_label')||'Enable E2EE (default)'}</label></div>
              {e2ee && (
                <div className="item" style={{borderTop:'1px dashed var(--border)', paddingTop:8, marginTop:8}}>
                  <div className="label">{t('e2ee.key_setup')||'Key setup'}</div>
                  <div className="cta-row" style={{marginTop:6}}>
                    <label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="radio" type="radio" name="key_method" checked={keyMethod==='generate'} onChange={()=> setKeyMethod('generate')} /> {t('e2ee.key_generate')||'Generate in browser (recommended)'}</label>
                    <label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="radio" type="radio" name="key_method" checked={keyMethod==='upload'} onChange={()=> setKeyMethod('upload')} /> {t('e2ee.key_upload')||'I have a public key'}</label>
                  </div>
                  {keyMethod==='generate' && (
                    <div className="item" style={{marginTop:8}}>
                      <div className="label">{t('e2ee.passphrase')||'Local private‑key passphrase'}</div>
                      <input className="input" type="password" value={pass} onChange={e=> setPass(e.target.value)} placeholder={t('e2ee.passphrase_placeholder')||'Enter passphrase (local only; never uploaded)'} />
                      <div className="muted" style={{marginTop:6}}>{t('e2ee.passphrase_help')||'Used to encrypt/unlock your private key in the browser. Never sent to the server.'}</div>
                      <div className="muted" style={{marginTop:6}}>{t('e2ee.pub_auto_note')||'Public key is generated and uploaded automatically when you click Create.'}</div>
                      <div className="muted" style={{marginTop:8, color:'#b36b00'}}>{t('e2ee.key_loss_warning')||'Warning: Private key never leaves your device. Losing it means your data is permanently unrecoverable.'}</div>
                    </div>
                  )}
                  {keyMethod==='upload' && (
                    <div className="item" style={{marginTop:8}}>
                      <div className="label">{t('e2ee.public_key')||'Public Key'}</div>
                      <textarea className="input" rows={4} value={pub} onChange={e=> setPub(e.target.value)} placeholder={t('e2ee.pub_placeholder')||'Paste base64 (x25519 raw) or PEM SPKI (RSA)'} />
                    </div>
                  )}
                  {warn && <div className="muted" style={{marginTop:8}}>{warn}</div>}
                </div>
              )}
            </div>
            <div className="card span-6">
              <h4 style={{marginTop:0}}>{t('consent_settings')||'Consent Settings'}</h4>
              <div className="row">
                <div className="card span-6"><div className="label">Version</div><input className="input" value={consentVersion} onChange={e=> setConsentVersion(e.target.value)} /></div>
                <div className="card span-6"><div className="label">{t('consent_en')||'Consent (EN)'}</div><textarea className="input" rows={3} value={consentTextEn} onChange={e=> setConsentTextEn(e.target.value)} placeholder="Optional additional text" /></div>
                <div className="card span-6"><div className="label">{t('consent_zh')||'Consent (ZH)'}</div><textarea className="input" rows={3} value={consentTextZh} onChange={e=> setConsentTextZh(e.target.value)} placeholder="可选补充文本" /></div>
              </div>
              <div className="label" style={{marginTop:8}}>{t('survey.consent_options')||'Interactive confirmations'}</div>
              <div className="tile" style={{padding:10, marginBottom:8}}>
                <div className="muted" style={{marginBottom:6}}>{t('consent.presets_title')||'Pick a preset (you can still tweak below):'}</div>
                <div className="cta-row">
                  <button className="btn" onClick={()=> applyConsentPreset('minimal')}>{t('consent.preset_min')||'Minimal'}</button>
                  <button className="btn" onClick={()=> applyConsentPreset('recommended')}>{t('consent.preset_rec')||'Recommended'}</button>
                  <button className="btn" onClick={()=> applyConsentPreset('strict')}>{t('consent.preset_strict')||'Strict'}</button>
                </div>
              </div>
              <div className="tile" style={{padding:10}}>
                <div className="muted" style={{marginBottom:6}}>{t('consent.simple_title')||'Ask participants to confirm:'}</div>
                <label className="item" style={{display:'flex',alignItems:'center',gap:8}}>
                  <input className="checkbox" type="checkbox" checked={!!getOpt('withdrawal')?.required} onChange={e=> setOptRequired('withdrawal', e.target.checked)} /> {t('survey.consent_opt.withdrawal')||'I understand I can withdraw at any time.'}
                </label>
                <label className="item" style={{display:'flex',alignItems:'center',gap:8}}>
                  <input className="checkbox" type="checkbox" checked={!!getOpt('data_use')?.required} onChange={e=> setOptRequired('data_use', e.target.checked)} /> {t('survey.consent_opt.data_use')||'I understand my data is for academic/aggregate use only.'}
                </label>
                <label className="item" style={{display:'flex',alignItems:'center',gap:8}}>
                  <input className="checkbox" type="checkbox" checked={!!getOpt('recording')?.required} onChange={e=> setOptRequired('recording', e.target.checked)} /> {t('survey.consent_opt.recording')||'I consent to audio/video recording where applicable.'}
                </label>
                <label className="item" style={{display:'flex',alignItems:'center',gap:8, marginTop:6}}>
                  <input className="checkbox" type="checkbox" checked={signatureRequired} onChange={e=> setSignatureRequired(e.target.checked)} /> {t('consent.require_signature')||'Require signature'}
                </label>
                <div className="muted" style={{marginTop:6}}>{t('consent.simple_hint')||'These are the common confirmations. Click “Advanced” to add your own items.'}</div>
                <div className="cta-row" style={{marginTop:6}}>
                  <button className="btn btn-ghost" onClick={()=> setShowAdvancedConsent(s=> !s)}>{showAdvancedConsent? (t('consent.hide_advanced')||'Hide Advanced') : (t('consent.show_advanced')||'Show Advanced')}</button>
                </div>
              </div>
              {showAdvancedConsent && (
                <>
                  {consentOptions.map((o, idx)=> (
                    <div key={idx} className="row" style={{marginTop:8}}>
                      <div className="card span-3"><div className="label">Key</div><input className="input" value={o.key} onChange={e=> setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, key: e.target.value}:x))} /></div>
                      <div className="card span-3"><div className="label">Required</div><label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="checkbox" type="checkbox" checked={o.required} onChange={e=> setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, required: e.target.checked}:x))} /> required</label></div>
                      <div className="card span-3"><div className="label">EN</div><input className="input" value={o.en||''} onChange={e=> setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, en: e.target.value}:x))} placeholder="Optional"/></div>
                      <div className="card span-3"><div className="label">中文</div><input className="input" value={o.zh||''} onChange={e=> setConsentOptions(list=> list.map((x,i)=> i===idx? {...x, zh: e.target.value}:x))} placeholder="可选"/></div>
                      <div className="cta-row" style={{marginTop:6}}>
                        <button className="btn btn-ghost" onClick={()=> setConsentOptions(list=> list.filter((_,i)=> i!==idx))}>Remove</button>
                        <button className="btn btn-ghost" onClick={()=> setConsentOptions(list=> { const a=[...list]; const t=a[idx]; a[idx]=a[Math.max(0,idx-1)]; a[Math.max(0,idx-1)]=t; return a })}>Up</button>
                        <button className="btn btn-ghost" onClick={()=> setConsentOptions(list=> { const a=[...list]; const t=a[idx]; a[idx]=a[Math.min(list.length-1,idx+1)]; a[Math.min(list.length-1,idx+1)]=t; return a })}>Down</button>
                      </div>
                    </div>
                  ))}
                  <div className="cta-row" style={{marginTop:8}}>
                    <button className="btn" onClick={()=> setConsentOptions(list=> [...list, { key:'custom_'+(list.length+1), required:false }])}>Add option</button>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="cta-row" style={{marginTop:12, justifyContent:'flex-end'}}>
            <button className="btn btn-primary" onClick={createScale}>{t('create')}</button>
          </div>
        </section>
      </div>
      <div className="row" style={{marginTop:16}}>
        <section className="card span-12">
          <h3 style={{marginTop:0}}>{t('your_scales')}</h3>
          {scales.length===0 && <div className="muted">{t('no_scales')}</div>}
          {scales.map((s:any)=>(
            <div key={s.id} className="item" style={{display:'flex',justifyContent:'space-between', alignItems:'center'}}>
              <div><b>{s.id}</b> · {(s.name_i18n?.en||'')}{s.name_i18n?.zh?` / ${s.name_i18n.zh}`:''} · {s.points} {t('points')}</div>
              <div style={{display:'flex',gap:8}}>
                {!s.e2ee_enabled ? (
                  <>
                    <a className="neon-btn" href={`/api/export?format=long&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_long_csv')}</a>
                    <a className="neon-btn" href={`/api/export?format=wide&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_wide_csv')}</a>
                    <a className="neon-btn" href={`/api/export?format=score&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_score_csv')}</a>
                  </>
                ) : (
                  <div className="muted" title={t('e2ee.csv_disabled_title')||'CSV exports are disabled when end‑to‑end encryption is ON'}>{t('e2ee.csv_disabled')||'CSV disabled (end‑to‑end encryption)'}</div>
                )}
                <button className="btn" onClick={()=>copyLink(s.id)}>{t('share')}</button>
                <a className="btn btn-ghost" href={shareLink(s.id)} target="_blank" rel="noreferrer">{t('open')}</a>
                <Link className="btn btn-primary" to={`/admin/scale/${encodeURIComponent(s.id)}`}>{t('manage')||'Manage'}</Link>
                <button className="btn btn-ghost" onClick={async()=>{
                  if (!confirm(t('confirm_delete_scale')||'Delete this scale and all its items/responses?')) return
                  try { await adminDeleteScale(s.id); setMsg(t('deleted') as string); toast.success(t('delete_success')||t('deleted')||'Deleted'); loadScales() } catch(e:any) { setMsg(e.message||String(e)); toast.error(e.message||String(e)) }
                }}>{t('delete')||'Delete'}</button>
              </div>
            </div>
          ))}
        </section>
      </div>
      {msg && <div className="muted" style={{marginTop:12}}>{msg}</div>}
    </div>
  )
}
