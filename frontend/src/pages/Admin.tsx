import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { adminListScales, adminCreateScale, adminAddProjectKey } from '../api/client'
import * as sodium from 'libsodium-wrappers'

export function Admin() {
  const { t } = useTranslation()
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

  function toAB(x: Uint8Array | ArrayBuffer) { return x instanceof Uint8Array ? x.slice(0).buffer : (x as ArrayBuffer).slice(0) }
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
      const body = { name_i18n: { en: nameEn, zh: nameZh }, points, e2ee_enabled: e2ee, region }
      const created = await adminCreateScale(body as any)
      // key setup if E2EE enabled
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
          // store locally and prompt download
          const blob = { v:1, alg:'x25519', enc_priv: b64(enc), iv: b64(iv), salt: b64(salt), pub: pubB64, fp: fingerprint }
          localStorage.setItem('synap_pmk', JSON.stringify(blob))
          public_key = pubB64
          setPub(pubB64)
          setWarn('Private key encrypted and stored locally. Download and keep it safe — losing it means permanent data loss.')
          // Offer file download
          const file = new Blob([JSON.stringify(blob, null, 2)], { type: 'application/json' })
          const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = `synap_pmk_${created.id}.json`; a.click(); URL.revokeObjectURL(a.href)
        } else {
          // upload mode: determine alg by content
          if (!public_key) throw new Error('Paste a public key')
          if (public_key.includes('BEGIN PUBLIC KEY')) algorithm = 'rsa+aesgcm'
          if (algorithm === 'x25519+xchacha20') fingerprint = await sha256b64(fromB64(public_key))
          else fingerprint = await sha256b64(new TextEncoder().encode(public_key))
        }
        await adminAddProjectKey(created.id, { alg: algorithm, kdf: 'hkdf-sha256', public_key, fingerprint })
      }
      setNameEn(''); setNameZh(''); setPoints(5); setPub(''); setPass(''); setKeyMethod('generate'); setWarn(''); loadScales()
    } catch (e:any) { setMsg(e.message||String(e)) }
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
      } else {
        setMsg(url)
      }
    } catch (e:any) { setMsg(e.message||String(e)) }
  }
  // Item creation is done within per-scale management page now.

  return (
    <div className="container">
      <div className="hero">
        <div className="glitch" data-text={t('admin_console')}>{t('admin_console')}</div>
        <div className="muted">{t('admin_console_sub')}</div>
      </div>
      <div className="row">
        <section className="card span-6">
          <h3 style={{marginTop:0}}>{t('create_scale')}</h3>
          <div className="item"><div className="label">{t('name_en')}</div><input className="input" value={nameEn} onChange={e=>setNameEn(e.target.value)} /></div>
          <div className="item"><div className="label">{t('name_zh')}</div><input className="input" value={nameZh} onChange={e=>setNameZh(e.target.value)} /></div>
          <div className="item"><div className="label">{t('points')}</div><input className="input" type="number" min={2} max={9} value={points} onChange={e=>setPoints(parseInt(e.target.value||'5'))} /></div>
          <div className="item"><label><input className="checkbox" type="checkbox" checked={e2ee} onChange={e=> setE2ee(e.target.checked)} /> {t('e2ee.enable_label')||'Enable E2EE (default)'}</label></div>
          <div className="item"><div className="label">{t('e2ee.region')||'Region'}</div>
            <select className="select" value={region} onChange={e=> setRegion(e.target.value as any)}>
              <option value="auto">auto</option>
              <option value="gdpr">gdpr</option>
              <option value="pipl">pipl</option>
              <option value="pdpa">pdpa</option>
              <option value="ccpa">ccpa</option>
            </select>
          </div>
          {e2ee && (
            <div className="item" style={{borderTop:'1px dashed var(--border)', paddingTop:8, marginTop:8}}>
              <div className="label">{t('e2ee.key_setup')||'Key setup'}</div>
              <div className="cta-row" style={{marginTop:6}}>
                <label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="radio" type="radio" name="key_method" checked={keyMethod==='generate'} onChange={()=> setKeyMethod('generate')} /> {t('e2ee.key_generate')||'Generate in browser (recommended)'}</label>
                <label style={{display:'inline-flex',gap:6,alignItems:'center'}}><input className="radio" type="radio" name="key_method" checked={keyMethod==='upload'} onChange={()=> setKeyMethod('upload')} /> {t('e2ee.key_upload')||'I have a public key'}</label>
              </div>
              {keyMethod==='generate' && (
                <div className="row" style={{marginTop:8}}>
                  <div className="card span-6"><div className="label">{t('e2ee.passphrase')||'Local private‑key passphrase'}</div>
                    <input className="input" type="password" value={pass} onChange={e=> setPass(e.target.value)} placeholder={t('e2ee.passphrase_placeholder')||'Enter passphrase (local only; never uploaded)'} />
                    <div className="muted" style={{marginTop:6}}>{t('e2ee.passphrase_help')||'Used to encrypt/unlock your private key in the browser. Never sent to the server.'}</div>
                  </div>
                  <div className="card span-6"><div className="label">{t('e2ee.public_key')||'Public Key (will be uploaded)'}</div>
                    <input className="input" readOnly value={pub} placeholder={t('e2ee.pub_will_fill')||'Will be filled after generation'} />
                  </div>
                  <div className="muted span-12" style={{marginTop:8, color:'#b36b00'}}>{t('e2ee.key_loss_warning')||'Warning: Private key never leaves your device. Losing it means your data is permanently unrecoverable.'}</div>
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
          <button className="btn btn-primary" onClick={createScale}>{t('create')}</button>
        </section>
        {/* Per-item add/edit is available in per-scale management */}
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
                  <div className="muted" title="CSV exports are disabled for E2EE projects">CSV disabled (E2EE)</div>
                )}
                <button className="btn" onClick={()=>copyLink(s.id)}>{t('share')}</button>
                <a className="btn btn-ghost" href={shareLink(s.id)} target="_blank" rel="noreferrer">{t('open')}</a>
                <Link className="btn btn-primary" to={`/admin/scale/${encodeURIComponent(s.id)}`}>{t('manage')||'Manage'}</Link>
              </div>
            </div>
          ))}
        </section>
      </div>
      {msg && <div className="muted" style={{marginTop:12}}>{msg}</div>}
    </div>
  )
}
