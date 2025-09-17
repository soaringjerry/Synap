import React, { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { adminCreateE2EEExport } from '../../../api/client'
import { decryptSingleWithX25519 } from '../../../crypto/e2ee'
import { useScaleEditorState, useScaleEditor } from '../ScaleEditorContext'

const toUint8 = (input: string): Uint8Array => {
  const raw = atob(input)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

const csvEsc = (value: any): string => {
  const asString = value == null
    ? ''
    : Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
  return '"' + asString.replace(/"/g, '""') + '"'
}

type ConsentColumn = {
  key: string
  en?: string
  zh?: string
}

export const ExportPanel: React.FC = () => {
  const { t } = useTranslation()
  const { scaleId } = useScaleEditor()
  const { scale, items } = useScaleEditorState()
  const [passphrase, setPassphrase] = useState('')
  const [status, setStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  if (!scale) return null
  const isE2EE = !!scale.e2ee_enabled
  const storageKey = useMemo(() => (scaleId ? `synap_pmk_${scaleId}` : 'synap_pmk'), [scaleId])

  const readStoredKey = () => localStorage.getItem(storageKey) ?? localStorage.getItem('synap_pmk')
  const storeKey = (blob: any) => {
    localStorage.setItem(storageKey, JSON.stringify(blob))
    if (storageKey !== 'synap_pmk') localStorage.removeItem('synap_pmk')
  }

  const unlockLocalPriv = async (): Promise<Uint8Array> => {
    const blobStr = readStoredKey()
    if (!blobStr) throw new Error(t('e2ee.import_required'))
    if (!passphrase) throw new Error(t('e2ee.passphrase_needed'))
    const blob = JSON.parse(blobStr)
    const saltBytes = toUint8(blob.salt)
    const ivBytes = toUint8(blob.iv)
    const encBytes = toUint8(blob.enc_priv)
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    )
    const saltBuffer = saltBytes.buffer.slice(0) as ArrayBuffer
    const encBuffer = encBytes.buffer.slice(0) as ArrayBuffer
    const ivBuffer = ivBytes.buffer.slice(0) as ArrayBuffer
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBuffer, iterations: 120000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    )
    const priv = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuffer }, key, encBuffer)
    return new Uint8Array(priv)
  }

  const decryptCurrentBundle = async () => {
    if (!scale) throw new Error('No scale loaded')
    const exp = await adminCreateE2EEExport(scaleId)
    const bundle: any = await (await fetch(exp.url)).json()
    const entries: any[] = bundle.entries || bundle.responses || []
    const priv = await unlockLocalPriv()
    const privB64 = btoa(String.fromCharCode(...priv))
    const out: any[] = []
    const enMap: Record<string, string> = {}
    const zhMap: Record<string, string> = {}
    items.forEach(it => {
      enMap[it.id] = it.stem_i18n?.en || it.stem || it.id
      zhMap[it.id] = it.stem_i18n?.zh || it.stem_i18n?.en || it.stem || it.id
    })
    for (const entry of entries) {
      try {
        const plain = await decryptSingleWithX25519(privB64, {
          ciphertext: entry.ciphertext,
          nonce: entry.nonce,
          enc_dek: entry.enc_dek || entry.EncDEK || [],
        })
        out.push(plain)
      } catch (err) {
        console.warn('Failed to decrypt entry', err)
      }
    }
    if (out.length === 0) throw new Error(t('e2ee.no_decrypted'))
    const consentOpts = Array.isArray(scale?.consent_config?.options)
      ? scale.consent_config.options
      : []
    const consentCols: ConsentColumn[] = consentOpts.map((opt: any) => {
      const fbEn = t(`survey.consent_opt.${opt.key}`, { lng: 'en' }) as string
      const fbZh = t(`survey.consent_opt.${opt.key}`, { lng: 'zh' }) as string
      const fallbackEn = fbEn && !fbEn.startsWith('survey.consent_opt.')
        ? fbEn
        : opt.key
      const fallbackZhSrc = fbZh && !fbZh.startsWith('survey.consent_opt.')
        ? fbZh
        : fallbackEn
      return {
        key: opt.key,
        en: opt.label_i18n?.en || fallbackEn,
        zh: opt.label_i18n?.zh || opt.label_i18n?.en || fallbackZhSrc,
      }
    })
    return { out, enMap, zhMap, consentCols }
  }

  const download = (name: string, data: string, type: string) => {
    const blob = new Blob([data], { type })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = name
    link.click()
    URL.revokeObjectURL(link.href)
  }

  if (!isE2EE) return null

  return (
    <>
      <h4 className="section-title" style={{ marginTop: 0 }}>{t('e2ee.export_title')}</h4>
      <div className="muted" style={{ marginBottom: 8 }}>{t('e2ee.local_export_desc')}</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div className="card span-12">
          <div className="item">
            <div className="label">{t('e2ee.passphrase')}</div>
            <input
              className="input"
              type="password"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              placeholder={t('e2ee.passphrase_placeholder') || ''}
            />
          </div>
          <div className="item">
            <div className="label">{t('e2ee.import_priv_title')}</div>
            <div className="cta-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" type="button" onClick={() => fileInputRef.current?.click()}>
                {t('e2ee.import_button')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={async event => {
                  try {
                    setStatus('')
                    const file = event.target.files?.[0]
                    if (!file) return
                    const text = await file.text()
                    const parsed = JSON.parse(text)
                    if (!parsed || !parsed.enc_priv || !parsed.iv || !parsed.salt) {
                      throw new Error(t('e2ee.invalid_key_file') || 'Invalid key file')
                    }
                    storeKey(parsed)
                    setStatus(t('e2ee.import_ok'))
                  } catch (err: any) {
                    setStatus(err?.message || String(err))
                  } finally {
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }
                }}
              />
            </div>
            <div className="muted" style={{ marginTop: 6 }}>{t('e2ee.import_priv_desc')}</div>
          </div>
          <div className="cta-row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                try {
                  setStatus('')
                  const { out } = await decryptCurrentBundle()
                  const lines = out.map((entry: any) => JSON.stringify(entry))
                  download(`e2ee_${scaleId}.jsonl`, `${lines.join('\n')}\n`, 'application/jsonl')
                  setStatus(t('e2ee.local_plain_ready'))
                } catch (err: any) {
                  setStatus(err?.message || String(err))
                }
              }}
            >
              {t('e2ee.local_decrypt_button')}
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                try {
                  setStatus('')
                  const { out, zhMap, consentCols } = await decryptCurrentBundle()
                  const order = items.map((it: any) => it.id)
                  const consentHeaders = consentCols.map(col => col.zh || col.en || col.key)
                  const header = [
                    'response_index',
                    'email',
                    ...order.map(key => zhMap[key] || key),
                    ...consentHeaders,
                  ]
                  const lines = [header.map(csvEsc).join(',')]
                  out.forEach((entry: any, idx: number) => {
                    const answers = entry.answers || {}
                    const email = entry.email || ''
                    const consent = entry.consent?.options || entry.consent_options || {}
                    const row = [csvEsc(idx + 1), csvEsc(email)]
                    order.forEach(key => row.push(csvEsc((answers as any)[key])))
                  consentCols.forEach((col: ConsentColumn) => {
                    row.push(csvEsc(consent[col.key] ? 1 : 0))
                  })
                    lines.push(row.join(','))
                  })
                  const csvText = '\uFEFF' + lines.join('\r\n') + '\r\n'
                  download(`e2ee_${scaleId}_long.csv`, csvText, 'text/csv;charset=utf-8')
                  setStatus(t('e2ee.local_csv_long_ready'))
                } catch (err: any) {
                  setStatus(err?.message || String(err))
                }
              }}
            >
              {t('e2ee.local_decrypt_csv_long')}
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                try {
                  setStatus('')
                  const { out, enMap, consentCols } = await decryptCurrentBundle()
                  const order = items.map((it: any) => it.id)
                  const consentHeaders = consentCols.map(col => col.en || col.zh || col.key)
                  const header = [
                    'response_index',
                    'email',
                    ...order.map(key => enMap[key] || key),
                    ...consentHeaders,
                  ]
                  const lines = [header.map(csvEsc).join(',')]
                  out.forEach((entry: any, idx: number) => {
                    const answers = entry.answers || {}
                    const email = entry.email || ''
                    const consent = entry.consent?.options || entry.consent_options || {}
                    const row = [csvEsc(idx + 1), csvEsc(email)]
                    order.forEach(key => row.push(csvEsc((answers as any)[key])))
                  consentCols.forEach((col: ConsentColumn) => {
                    row.push(csvEsc(consent[col.key] ? 1 : 0))
                  })
                    lines.push(row.join(','))
                  })
                  const csvText = '\uFEFF' + lines.join('\r\n') + '\r\n'
                  download(`e2ee_${scaleId}_wide_en.csv`, csvText, 'text/csv;charset=utf-8')
                  setStatus(t('e2ee.local_csv_wide_ready'))
                } catch (err: any) {
                  setStatus(err?.message || String(err))
                }
              }}
            >
              {t('e2ee.local_decrypt_csv_wide')}
            </button>
          </div>
          {status && <div className="muted" style={{ marginTop: 8 }}>{status}</div>}
        </div>
      </div>
    </>
  )
}

export default ExportPanel
