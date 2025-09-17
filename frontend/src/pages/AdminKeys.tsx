import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as sodium from 'libsodium-wrappers'
import { adminAddProjectKey, adminListScales } from '../api/client'
import { useToast } from '../components/Toast'

function toAB(x: Uint8Array | ArrayBuffer) { return x instanceof Uint8Array ? x.slice(0).buffer : (x as ArrayBuffer).slice(0) }
async function deriveKey(pass: string, salt: Uint8Array) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pass).buffer, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name:'PBKDF2', salt: toAB(salt), iterations: 120000, hash: 'SHA-256' }, keyMaterial, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt'])
}
function b64(ab: ArrayBuffer | Uint8Array) { const u8 = ab instanceof Uint8Array ? ab : new Uint8Array(ab); let s=''; for (let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]); return btoa(s) }
function fromB64(s: string) { const bin=atob(s); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u }
async function sha256b64(u8: Uint8Array) { const d=await crypto.subtle.digest('SHA-256', toAB(u8)); return b64(d) }

export function AdminKeys() {
  const { t } = useTranslation()
  const toast = useToast()
  const [pass, setPass] = useState('')
  const [pub, setPub] = useState('')
  const [fp, setFp] = useState('')
  const [msg, setMsg] = useState('')
  const [scales, setScales] = useState<any[]>([])
  const [sel, setSel] = useState('')
  const fileRef = React.useRef<HTMLInputElement|null>(null)
  const storageKeyFor = (scaleId: string) => (scaleId ? `synap_pmk_${scaleId}` : 'synap_pmk')

  useEffect(()=>{ (async()=>{ try { const res = await adminListScales(); setScales(res.scales||[]); if (res.scales?.length) setSel(res.scales[0].id) } catch{} })() },[])

  async function genX25519() {
    setMsg('')
    try {
      await sodium.ready
      const kp = sodium.crypto_kx_keypair()
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const key = await deriveKey(pass, salt)
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const enc = await crypto.subtle.encrypt({ name:'AES-GCM', iv: toAB(iv) }, key, kp.privateKey.buffer)
      const pubB64 = b64(kp.publicKey)
      const fingerprint = await sha256b64(kp.publicKey)
      const blob = { v:1, alg:'x25519', enc_priv: b64(enc), iv: b64(iv), salt: b64(salt), pub: pubB64, fp: fingerprint }
      const targetKey = storageKeyFor(sel)
      localStorage.setItem(targetKey, JSON.stringify(blob))
      if (targetKey !== 'synap_pmk') localStorage.removeItem('synap_pmk')
      setPub(pubB64); setFp(fingerprint); setMsg('Key generated and stored locally (encrypted). Keep your passphrase safe!')
      toast.success('Key generated')
    } catch(e:any) { setMsg(e.message||String(e)) }
  }

  async function register() {
    setMsg('')
    try {
      if (!sel) throw new Error('Select a project')
      if (!pub || !fp) throw new Error('Generate or paste a public key')
      await adminAddProjectKey(sel, { alg:'x25519+xchacha20', kdf:'hkdf-sha256', public_key: pub, fingerprint: fp })
      setMsg(t('saved') as string)
      toast.success(t('saved')||'Saved')
    } catch(e:any) { setMsg(e.message||String(e)) }
  }

  return (
    <div className="container">
      <div className="hero">
        <div className="glitch" data-text="Key Management">Key Management</div>
        <div className="muted">Generate/store project master keys locally. Platform stores public keys only.</div>
      </div>
      <div className="row">
        <section className="card span-6">
          <h3 style={{marginTop:0}}>Generate X25519</h3>
          <div className="item"><div className="label">Passphrase (local encryption)</div>
            <input className="input" type="password" value={pass} onChange={e=> setPass(e.target.value)} placeholder="Strong passphrase" />
          </div>
          <button className="btn btn-primary" onClick={genX25519} disabled={!pass}>Generate</button>
          <div className="divider" />
          <div className="item"><div className="label">Public Key (base64, raw 32B)</div>
            <textarea className="input" rows={3} value={pub} onChange={e=> setPub(e.target.value)} />
          </div>
          <div className="item"><div className="label">Fingerprint (SHA-256, base64)</div>
            <input className="input" value={fp} onChange={e=> setFp(e.target.value)} />
          </div>
        </section>
        <section className="card span-6">
          <h3 style={{marginTop:0}}>Register to Project</h3>
          <div className="item"><div className="label">Project (Scale)</div>
            <select className="select" value={sel} onChange={e=> setSel(e.target.value)}>
              {scales.map((s:any)=> <option key={s.id} value={s.id}>{s.id} · {(s.name_i18n?.en||'')}</option>)}
            </select>
          </div>
          <button className="btn" onClick={register} disabled={!sel || !pub || !fp}>Register Public Key</button>
          <div className="muted" style={{marginTop:8}}>Keep your passphrase safe. Losing it means you cannot decrypt data.</div>
          <div className="divider" />
          <h4 style={{marginTop:0}}>{t('e2ee.import_priv_title')||'Import local private key'}</h4>
          <div className="muted">{t('e2ee.import_priv_desc')||'Select the previously downloaded JSON key file. It will be stored in this browser only (never uploaded). Use your passphrase to unlock.'}</div>
          <div className="cta-row" style={{marginTop:8}}>
            <button className="btn" onClick={()=> fileRef.current?.click()}>{t('e2ee.import_button')||'Import key file'}</button>
            <input ref={fileRef} type="file" accept="application/json" style={{display:'none'}} onChange={async (e)=>{
              try {
                setMsg('')
                const f = e.target.files?.[0]; if (!f) return
                const text = await f.text()
                const obj = JSON.parse(text)
                if (!obj || !obj.enc_priv || !obj.iv || !obj.salt || !obj.pub) throw new Error('Invalid key file')
                const targetKey = storageKeyFor(sel)
                localStorage.setItem(targetKey, JSON.stringify(obj))
                if (targetKey !== 'synap_pmk') localStorage.removeItem('synap_pmk')
                setMsg(t('e2ee.import_ok')||'Key imported and stored locally. Not uploaded.')
                toast.success(t('e2ee.import_ok')||'Imported')
                e.currentTarget.value = ''
              } catch(err:any) {
                setMsg(err.message||String(err))
                toast.error(err.message||String(err))
              }
            }} />
          </div>
        </section>
      </div>
      {msg && <div className="muted" style={{marginTop:12}}>{msg}</div>}
    </div>
  )
}
