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
  // Advanced options
  const [headerLang, setHeaderLang] = useState<'en'|'zh'>('en')
  const [valuesMode, setValuesMode] = useState<'numeric'|'label'>('numeric')
  const [labelLang, setLabelLang] = useState<'en'|'zh'>('en')
  // Server export (non‑E2EE)
  const [format, setFormat] = useState<'long'|'wide'|'score'>('wide')
  const [consentHeader, setConsentHeader] = useState<'label_en'|'label_zh'|'key'>('label_en')
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
        const created = entry.created_at || entry.createdAt || entry.CreatedAt || ''
        out.push({ ...plain, created_at: created })
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

  // Map textual options using item.options_i18n if possible.
  const itemsById = useMemo(() => {
    const m: Record<string, any> = {}
    items.forEach(it => { m[it.id] = it })
    return m
  }, [items])

  const normToLang = (item: any, val: any, lang: 'en'|'zh'): any => {
    if (!item || !item.options_i18n) return val
    const opts = item.options_i18n as Record<string, string[]>
    const findIndex = (s: string): number => {
      const target = String(s).trim().toLowerCase()
      for (const list of Object.values(opts)) {
        for (let i = 0; i < list.length; i++) {
          if (String(list[i] ?? '').trim().toLowerCase() === target) return i
        }
      }
      return -1
    }
    const getLang = (idx: number): string => {
      const arr = (opts[lang] || [])
      const lab = arr[idx]
      if (lab && String(lab).trim() !== '') return lab
      const en = (opts.en || [])[idx]
      if (en && String(en).trim() !== '') return en
      for (const list of Object.values(opts)) {
        const v = (list || [])[idx]
        if (v && String(v).trim() !== '') return v
      }
      return ''
    }
    if (Array.isArray(val)) {
      let changed = false
      const out = val.map(v => {
        const idx = findIndex(v)
        if (idx >= 0) { changed = true; return getLang(idx) }
        return v
      })
      return changed ? out : val
    }
    if (val != null && typeof val === 'string') {
      const idx = findIndex(val)
      if (idx >= 0) return getLang(idx)
      return val
    }
    return val
  }

  const mapLikertNumberToLabel = (item: any, num: number, lang: 'en'|'zh'): string => {
    if (!num || num <= 0) return String(num || '')
    // prefer item likert, fall back to scale likert
    const labels = item?.likert_labels_i18n?.[lang]
      || item?.likert_labels_i18n?.en
      || scale?.likert_labels_i18n?.[lang]
      || scale?.likert_labels_i18n?.en
    if (Array.isArray(labels)) {
      const idx = Math.max(0, Math.min(labels.length - 1, Math.floor(num) - 1))
      return labels[idx] || String(num)
    }
    return String(num)
  }

  const download = (name: string, data: string, type: string) => {
    const blob = new Blob([data], { type })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = name
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const renderE2EE = () => (
    <>
      <h4 className="section-title" style={{ marginTop: 0 }}>{t('e2ee.export_title')}</h4>
      <div className="muted" style={{ marginBottom: 8 }}>{t('e2ee.local_export_desc')}</div>
      <div className="row" style={{ gap: 8, margin: '8px 0' }}>
        <div className="item">
          <div className="label">{t('label.header_language')}</div>
          <select className="input" value={headerLang} onChange={e => setHeaderLang(e.target.value as any)}>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
        <div className="item">
          <div className="label">{t('label.value_mode')}</div>
          <select className="input" value={valuesMode} onChange={e => setValuesMode(e.target.value as any)}>
            <option value="numeric">{t('label.numeric')}</option>
            <option value="label">{t('label.text_label')}</option>
          </select>
        </div>
        {valuesMode === 'label' && (
          <div className="item">
            <div className="label">{t('label.label_language')}</div>
            <select className="input" value={labelLang} onChange={e => setLabelLang(e.target.value as any)}>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
        )}
      </div>
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
                  const { out, enMap, zhMap, consentCols } = await decryptCurrentBundle()
                  const order = items.map((it: any) => it.id)
                  const consentHeaders = consentCols.map(col => (headerLang === 'zh' ? (col.zh || col.en || col.key) : (col.en || col.zh || col.key)))
                  const header = [
                    'response_index',
                    'email',
                    'submitted_at',
                    ...order.map(key => (headerLang === 'zh' ? (zhMap[key] || enMap[key] || key) : (enMap[key] || key))),
                    ...consentHeaders,
                  ]
                  const lines = [header.map(csvEsc).join(',')]
                  out.forEach((entry: any, idx: number) => {
                    const answers = entry.answers || {}
                    const email = entry.email || ''
                    const consent = entry.consent?.options || entry.consent_options || {}
                    const row = [csvEsc(idx + 1), csvEsc(email), csvEsc((entry as any).created_at || '')]
                    order.forEach(key => {
                      const item = itemsById[key]
                      const v = (answers as any)[key]
                      let outVal: any = v
                      if (valuesMode === 'label') {
                        if (typeof v === 'number') {
                          outVal = mapLikertNumberToLabel(item, v, labelLang)
                        } else {
                          outVal = normToLang(item, v, labelLang)
                        }
                      } else {
                        // numeric mode: normalise textual options to English for consistency
                        if (typeof v !== 'number') {
                          outVal = normToLang(item, v, 'en')
                        }
                      }
                      row.push(csvEsc(outVal))
                    })
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
                  const { out, enMap, zhMap, consentCols } = await decryptCurrentBundle()
                  const order = items.map((it: any) => it.id)
                  const consentHeaders = consentCols.map(col => (headerLang === 'zh' ? (col.zh || col.en || col.key) : (col.en || col.zh || col.key)))
                  const header = [
                    'response_index',
                    'email',
                    'submitted_at',
                    ...order.map(key => (headerLang === 'zh' ? (zhMap[key] || enMap[key] || key) : (enMap[key] || key))),
                    ...consentHeaders,
                  ]
                  const lines = [header.map(csvEsc).join(',')]
                  out.forEach((entry: any, idx: number) => {
                    const answers = entry.answers || {}
                    const email = entry.email || ''
                    const consent = entry.consent?.options || entry.consent_options || {}
                    const row = [csvEsc(idx + 1), csvEsc(email), csvEsc((entry as any).created_at || '')]
                    order.forEach(key => {
                      const item = itemsById[key]
                      const v = (answers as any)[key]
                      let outVal: any = v
                      if (valuesMode === 'label') {
                        if (typeof v === 'number') {
                          outVal = mapLikertNumberToLabel(item, v, labelLang)
                        } else {
                          outVal = normToLang(item, v, labelLang)
                        }
                      } else {
                        if (typeof v !== 'number') {
                          outVal = normToLang(item, v, 'en')
                        }
                      }
                      row.push(csvEsc(outVal))
                    })
                  consentCols.forEach((col: ConsentColumn) => {
                    row.push(csvEsc(consent[col.key] ? 1 : 0))
                  })
                    lines.push(row.join(','))
                  })
                  const csvText = '\uFEFF' + lines.join('\r\n') + '\r\n'
                  download(`e2ee_${scaleId}_wide_${headerLang}.csv`, csvText, 'text/csv;charset=utf-8')
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

  const renderServer = () => (
    <>
      <h4 className="section-title" style={{ marginTop: 0 }}>{t('export')}</h4>
      <div className="muted" style={{ marginBottom: 8 }}>{t('editor.export_server_desc') || 'Export CSV from server (plaintext projects).'}</div>
      <div className="row" style={{ gap: 8, margin: '8px 0' }}>
        <div className="item">
          <div className="label">{t('label.format')}</div>
          <select className="input" value={format} onChange={e => setFormat(e.target.value as any)}>
            <option value="wide">{t('label.wide')}</option>
            <option value="long">{t('label.long')}</option>
            <option value="score">{t('label.score')}</option>
          </select>
        </div>
        <div className="item">
          <div className="label">{t('label.header_language')}</div>
          <select className="input" value={headerLang} onChange={e => setHeaderLang(e.target.value as any)}>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
        <div className="item">
          <div className="label">{t('label.value_mode')}</div>
          <select className="input" value={valuesMode} onChange={e => setValuesMode(e.target.value as any)}>
            <option value="numeric">{t('label.numeric')}</option>
            <option value="label">{t('label.text_label')}</option>
          </select>
        </div>
        {valuesMode === 'label' && (
          <div className="item">
            <div className="label">{t('label.label_language')}</div>
            <select className="input" value={labelLang} onChange={e => setLabelLang(e.target.value as any)}>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </div>
        )}
        <div className="item">
          <div className="label">{t('label.consent_header')}</div>
          <select className="input" value={consentHeader} onChange={e => setConsentHeader(e.target.value as any)}>
            <option value="label_en">Consent (EN)</option>
            <option value="label_zh">Consent (中文)</option>
            <option value="key">consent.key</option>
          </select>
        </div>
      </div>
      <div className="cta-row" style={{ gap: 8 }}>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            try {
              setStatus('')
              const qs = new URLSearchParams({
                scale_id: String(scaleId),
                format,
                consent_header: consentHeader,
                header_lang: headerLang,
                values: valuesMode,
                label_lang: labelLang,
              })
              const base = (typeof window !== 'undefined' ? window.location.origin : '')
              const url = `${base}/api/export?${qs.toString()}`
              const res = await fetch(url, { credentials: 'include' })
              if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
              const blob = await res.blob()
              const link = document.createElement('a')
              link.href = URL.createObjectURL(blob)
              link.download = `export_${format}.csv`
              link.click()
              URL.revokeObjectURL(link.href)
            } catch (err: any) {
              setStatus(err?.message || String(err))
            }
          }}
        >
          {t('download')}
        </button>
      </div>
      {status && <div className="muted" style={{ marginTop: 8 }}>{status}</div>}
    </>
  )

  return (
    <>
      {isE2EE ? renderE2EE() : renderServer()}
    </>
  )
}

export default ExportPanel
