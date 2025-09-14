import * as sodium from 'libsodium-wrappers'

function ab2b64(ab: ArrayBuffer | Uint8Array): string {
  const buf = ab instanceof Uint8Array ? ab : new Uint8Array(ab)
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return btoa(bin)
}
function b642ab(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function toAB(x: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (x instanceof Uint8Array) return x.slice(0).buffer
  return (x as ArrayBuffer).slice(0)
}

async function sha256(data: Uint8Array | string): Promise<string> {
  const enc = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const d = await crypto.subtle.digest('SHA-256', toAB(enc))
  return ab2b64(d)
}

// HKDF-SHA256
async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', toAB(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', key, toAB(ikm))
}
async function hkdfExpand(prk: ArrayBuffer, info: Uint8Array, length: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  // single block sufficient for 32-byte KEK
  const T0 = new Uint8Array(0)
  const input = new Uint8Array(T0.length + info.length + 1)
  input.set(T0, 0)
  input.set(info, T0.length)
  input[input.length - 1] = 1
  const out = await crypto.subtle.sign('HMAC', key, toAB(input))
  return (out as ArrayBuffer).slice(0, length)
}

export type PublicKeyEntry = { alg: 'x25519+xchacha20' | 'rsa+aesgcm'; kdf: 'hkdf-sha256'; public_key: string; fingerprint: string }

export async function e2eeInit(): Promise<boolean> {
  try { await sodium.ready; return true } catch { return false }
}

export async function encryptForProject(payload: any, scaleId: string, keys: PublicKeyEntry[]) {
  const enc = new TextEncoder()
  const plain = enc.encode(JSON.stringify(payload))
  // Generate DEK (32 bytes)
  let dek = new Uint8Array(32)
  crypto.getRandomValues(dek)
  // Encrypt payload with XChaCha20-Poly1305
  await sodium.ready
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  // For portability, avoid external AAD (set to null)
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plain, null, null, nonce, dek)
  const ciphertext = ab2b64(ct)
  const nonceB64 = ab2b64(nonce)
  const aad_hash = ''
  // Envelope for each recipient key
  const encDEK: string[] = []
  let pmk_fingerprint = keys[0]?.fingerprint || ''
  for (const k of keys) {
    try {
      if (k.alg === 'x25519+xchacha20') {
        // Expect k.public_key as base64 raw 32-byte X25519 public key
        const rpub = b642ab(k.public_key)
        const eph = sodium.crypto_kx_keypair() // X25519 keys
        const shared = sodium.crypto_scalarmult(eph.privateKey, rpub)
        // HKDF-SHA256 derive 32-byte KEK using salt=eph.pub, info='synap-e2ee'
        const prk = await hkdfExtract(eph.publicKey, shared)
        const kekBuf = await hkdfExpand(prk, enc.encode('synap-e2ee'), 32)
        const kek = new Uint8Array(kekBuf)
        const n2 = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
        const wrapped = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(dek, null, null, n2, kek)
        const env = {
          alg: 'x25519+xchacha20', kdf: 'hkdf-sha256', eph_pub: ab2b64(eph.publicKey), nonce: ab2b64(n2), ct: ab2b64(wrapped)
        }
        encDEK.push(JSON.stringify(env))
      } else if (k.alg === 'rsa+aesgcm') {
        // Expect PEM SPKI or base64 DER public key
        let der: ArrayBuffer
        const pk = k.public_key.trim()
        if (pk.includes('BEGIN PUBLIC KEY')) {
          const b64 = pk.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, '')
          der = toAB(b642ab(b64))
        } else {
          der = toAB(b642ab(pk))
        }
        const spki = await crypto.subtle.importKey('spki', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
        const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, spki, toAB(dek))
        const env = { alg: 'rsa+aesgcm', ct: ab2b64(wrapped) }
        encDEK.push(JSON.stringify(env))
      }
    } catch (e) {
      // skip invalid key
      continue
    }
  }
  return { ciphertext, nonce: nonceB64, aad_hash, encDEK, pmk_fingerprint }
}

export async function decryptSingleWithX25519(privRawB64: string, rec: { ciphertext: string; nonce: string; enc_dek: string[] }) {
  await sodium.ready
  const priv = b642ab(privRawB64)
  let dek: Uint8Array | null = null
  for (const envStr of rec.enc_dek) {
    try {
      const env = JSON.parse(envStr)
      if (env.alg !== 'x25519+xchacha20') continue
      const ephPub = b642ab(env.eph_pub)
      const shared = sodium.crypto_scalarmult(priv, ephPub)
      const prk = await hkdfExtract(ephPub, shared)
      const kekBuf = await hkdfExpand(prk, new TextEncoder().encode('synap-e2ee'), 32)
      const kek = new Uint8Array(kekBuf)
      const n2 = b642ab(env.nonce)
      const wrapped = b642ab(env.ct)
      dek = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, wrapped, null, n2, kek)
      if (dek) break
    } catch {}
  }
  if (!dek) throw new Error('No matching envelope for provided private key')
  const nonce = b642ab(rec.nonce)
  const ct = b642ab(rec.ciphertext)
  const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ct, null, nonce, dek)
  const dec = new TextDecoder()
  return JSON.parse(dec.decode(plain))
}
