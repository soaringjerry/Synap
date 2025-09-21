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
  const [itemsPerPage, setItemsPerPage] = useState<string>('0')
  const [e2ee, setE2ee] = useState(true)
  const [region, setRegion] = useState<'auto'|'gdpr'|'pipl'|'pdpa'|'ccpa'>('auto')
  const [turnstile, setTurnstile] = useState(false)
  const [keyMethod, setKeyMethod] = useState<'upload'|'generate'>('generate')
  const [pub, setPub] = useState('')
  const [pass, setPass] = useState('')
  const [warn, setWarn] = useState('')
  const storageKeyFor = (scaleId: string) => (scaleId ? `synap_pmk_${scaleId}` : 'synap_pmk')
  const pendingKey = 'synap_pmk_pending'

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
      // Pre-validate and prepare key material when E2EE is ON
      let prepared: null | { algorithm: 'x25519+xchacha20'|'rsa+aesgcm'; public_key: string; fingerprint: string; download?: Blob; privateBlob?: any } = null
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
          localStorage.setItem(pendingKey, JSON.stringify(blob))
          public_key = pubB64
          prepared = { algorithm, public_key, fingerprint, download: new Blob([JSON.stringify(blob, null, 2)], { type: 'application/json' }), privateBlob: blob }
        } else {
          if (!public_key) throw new Error('Paste a public key')
          if (public_key.includes('BEGIN PUBLIC KEY')) algorithm = 'rsa+aesgcm'
          if (algorithm === 'x25519+xchacha20') fingerprint = await sha256b64(fromB64(public_key))
          else fingerprint = await sha256b64(new TextEncoder().encode(public_key))
          prepared = { algorithm, public_key, fingerprint }
        }
      }
      const defaultConsentOptions = [
        { key: 'withdrawal', required: true },
        { key: 'data_use', required: true },
        { key: 'recording', required: false },
      ]
      const body: any = {
        name_i18n: { en: nameEn, zh: nameZh },
        e2ee_enabled: e2ee,
        region,
        turnstile_enabled: !!turnstile,
        consent_config: {
          version: 'v1',
          options: defaultConsentOptions,
          signature_required: true,
        },
      }
      const ipp = parseInt(itemsPerPage||'0'); if (!Number.isNaN(ipp)) body.items_per_page = ipp
      const created = await adminCreateScale(body as any)
      if (e2ee && prepared) {
        try {
          await adminAddProjectKey(created.id, { alg: prepared.algorithm, kdf: 'hkdf-sha256', public_key: prepared.public_key, fingerprint: prepared.fingerprint })
          if (prepared.privateBlob) {
            localStorage.setItem(storageKeyFor(created.id), JSON.stringify(prepared.privateBlob))
            localStorage.removeItem(pendingKey)
            localStorage.removeItem('synap_pmk')
          }
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
      setNameEn(''); setNameZh(''); setPub(''); setPass(''); setKeyMethod('generate'); setWarn(''); setItemsPerPage('0'); setRegion('auto'); setTurnstile(false); setE2ee(true)
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
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div>
              <b>Operations</b>
              <div className="muted">Tenant-scoped audit and collaboration</div>
            </div>
            <div style={{display:'flex', gap:8}}>
              <Link className="btn" to="/admin/audit">Audit Log</Link>
            </div>
          </div>
        </section>
      </div>
      <div className="row">
        <section className="card span-12">
          <h3 style={{marginTop:0}}>{t('create_scale')}</h3>
          <div className="row">
            <div className="card span-6">
              <h4 style={{marginTop:0}}>Scale Basics</h4>
              <div className="item"><div className="label">{t('name_en')}</div><input className="input" value={nameEn} onChange={e=>setNameEn(e.target.value)} /></div>
              <div className="item"><div className="label">{t('name_zh')}</div><input className="input" value={nameZh} onChange={e=>setNameZh(e.target.value)} /></div>
              <div className="item"><div className="label">Items per page</div><input className="input" type="number" min={0} max={50} value={itemsPerPage} onChange={e=> setItemsPerPage(e.target.value)} placeholder="0 = all on one page" /></div>
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
              <div className="item"><label><input className="checkbox" type="checkbox" checked={turnstile} onChange={e=> setTurnstile(e.target.checked)} /> {t('turnstile.enable_label')||'Enable Cloudflare Turnstile (default)'}</label></div>
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
              <h4 style={{marginTop:0}}>{t('admin.create_after_title')||'After creation'}</h4>
              <div className="muted" style={{marginBottom:8}}>{t('admin.create_after_hint')||'Advanced consent text, interactive confirmations, and pagination now reside in the new editor. Finish creation here, then open Settings → Consent/Security to customise.'}</div>
              <ul className="kv-list">
                <li>👉 {t('admin.after_consent')||'Consent text & interactive confirmations: Settings → Consent'}</li>
                <li>👉 {t('admin.after_security')||'Turnstile, region, email collection: Settings → Security'}</li>
                <li>👉 {t('admin.after_likert')||'Likert defaults & AI translation live in the editor tabs'}</li>
              </ul>
              <div className="muted" style={{marginTop:12}}>{t('admin.after_tip')||'You can still preview or export immediately from Share & Results after creating the scale.'}</div>
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
          {scales.length===0 && (
            <div className="tile" style={{padding:12}}>
              <div className="muted" style={{marginBottom:8}}>{t('no_scales')}</div>
              <div className="label">Checklist</div>
              <ul className="kv-list">
                <li>✅ {t('admin.checklist_create')||'Create your first scale (keep E2EE enabled if you need encryption)'}</li>
                <li>✅ {t('admin.checklist_settings')||'Open Settings to adjust consent, email collection, pagination'}</li>
                <li>✅ {t('admin.checklist_share')||'Share the participant link and collect a test response'}</li>
                <li>✅ {t('admin.checklist_export')||'Visit Share & Results for analytics and exports'}</li>
              </ul>
            </div>
          )}
          {scales.map((s:any)=>(
            <div key={s.id} className="item" style={{display:'flex',justifyContent:'space-between', alignItems:'center'}}>
              <div><b>{s.id}</b> · {(s.name_i18n?.en||'')}{s.name_i18n?.zh?` / ${s.name_i18n.zh}`:''}</div>
              <div style={{display:'flex',gap:8}}>
                {!s.e2ee_enabled ? (
                  <>
                    <a className="neon-btn" href={`/api/export?format=long&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_long_csv')}</a>
                    <a className="neon-btn" href={`/api/export?format=wide&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_wide_csv')}</a>
                    <a className="neon-btn" href={`/api/export?format=score&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_score_csv')}</a>
                    <a className="neon-btn" href={`/api/export?format=items&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_items_csv')||'Export Items CSV'}</a>
                  </>
                ) : (
                  <>
                    <div className="muted" title={t('e2ee.csv_disabled_title')||'CSV exports are disabled when end‑to‑end encryption is ON'}>{t('e2ee.csv_disabled')||'CSV disabled (end‑to‑end encryption)'}</div>
                    <a className="neon-btn" href={`/api/export?format=items&scale_id=${encodeURIComponent(s.id)}`} target="_blank">{t('export_items_csv')||'Export Items CSV'}</a>
                  </>
                )}
                <button className="btn" onClick={()=>copyLink(s.id)}>{t('share')}</button>
                <a className="btn btn-ghost" href={shareLink(s.id)} target="_blank" rel="noreferrer">{t('open')}</a>
                <Link className="btn btn-primary" to={`/admin/scale/${encodeURIComponent(s.id)}`}>{t('manage')||'Manage'}</Link>
                <Link className="btn" to={`/admin/scale/${encodeURIComponent(s.id)}/legacy`}>{t('editor.legacy_view')||'旧版视图'}</Link>
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
