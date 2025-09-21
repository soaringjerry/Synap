import React, { useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../components/Toast'
import {
  adminAITranslatePreview,
  adminGetAIConfig,
  adminUpdateItem,
  adminUpdateScale,
} from '../../../api/client'
import DangerZone from '../components/DangerZone'
import CollaboratorsPanel from '../components/CollaboratorsPanel'
import { LIKERT_PRESETS } from '../constants'
import { useScaleEditor } from '../ScaleEditorContext'
import {
  ConsentOptionForm,
  ScaleEditorAIState,
  ScaleEditorConsentState,
  ScaleEditorSettingsState,
} from '../state'

type ConsentMode = 'off' | 'optional' | 'required'

type ConsentModeConfig = {
  key: string
  label: string
}

const CONSENT_PRESETS: ConsentModeConfig[] = [
  { key: 'withdrawal', label: 'survey.consent_opt.withdrawal' },
  { key: 'data_use', label: 'survey.consent_opt.data_use' },
  { key: 'recording', label: 'survey.consent_opt.recording' },
]

const consentModeLabel = (
  mode: ConsentMode,
  t: (key: string) => string,
): string => {
  switch (mode) {
    case 'optional':
      return t('consent.mode.optional')
    case 'required':
      return t('consent.mode.required')
    default:
      return t('consent.mode.off')
  }
}

const sanitizeNumberInput = (value: string, fallback: number): number => {
  const parsed = parseInt(value || '0', 10)
  if (Number.isNaN(parsed)) return fallback
  return parsed
}

const SettingsView: React.FC = () => {
  const { state, dispatch, scaleId, reload } = useScaleEditor()
  const { scale, items, settings, consent, ai } = state
  const { t, i18n } = useTranslation()
  const toast = useToast()

  const updateSettings = useCallback(
    (payload: Partial<ScaleEditorSettingsState>) => {
      dispatch({ type: 'setSettings', payload })
    },
    [dispatch],
  )

  const updateConsent = useCallback(
    (payload: Partial<Omit<ScaleEditorConsentState, 'options'>>) => {
      dispatch({ type: 'setConsent', payload })
    },
    [dispatch],
  )

  const applyConsentOptions = useCallback(
    (next: ConsentOptionForm[]) => {
      dispatch({ type: 'setConsentOptions', options: next })
    },
    [dispatch],
  )

  const updateConsentOptions = useCallback(
    (updater: (options: ConsentOptionForm[]) => ConsentOptionForm[]) => {
      applyConsentOptions(updater(consent.options))
    },
    [applyConsentOptions, consent.options],
  )

  const setAiState = useCallback(
    (payload: Partial<ScaleEditorAIState>) => {
      dispatch({ type: 'setAiState', payload })
    },
    [dispatch],
  )

  const updateAiPreview = useCallback(
    (updater: (prev: any | null) => any | null) => {
      dispatch({ type: 'updateAiPreview', updater })
    },
    [dispatch],
  )

  const setAiInclude = useCallback(
    (include: Record<string, boolean>) => {
      dispatch({ type: 'setAiInclude', include })
    },
    [dispatch],
  )

  useEffect(() => {
    let canceled = false
    const run = async () => {
      try {
        const cfg = await adminGetAIConfig()
        if (!canceled) {
          setAiState({ ready: !!cfg.openai_key && !!cfg.allow_external })
        }
      } catch {
        if (!canceled) setAiState({ ready: false })
      }
    }
    run()
    return () => {
      canceled = true
    }
  }, [scaleId, setAiState])

  const getOpt = useCallback(
    (key: string) => consent.options.find(o => o.key === key),
    [consent.options],
  )

  const setOptMode = useCallback(
    (key: string, mode: ConsentMode) => {
      updateConsentOptions(list => {
        if (mode === 'off') return list.filter(o => o.key !== key)
        const idx = list.findIndex(o => o.key === key)
        const enLabel = i18n.t(`survey.consent_opt.${key}` as const, { lng: 'en' })
        const zhLabel = i18n.t(`survey.consent_opt.${key}` as const, { lng: 'zh' })
        const labelEn = enLabel !== `survey.consent_opt.${key}` ? enLabel : undefined
        const labelZh = zhLabel !== `survey.consent_opt.${key}` ? zhLabel : undefined
        if (idx === -1) {
          return [
            ...list,
            {
              key,
              required: mode === 'required',
              en: labelEn,
              zh: labelZh,
            },
          ]
        }
        const next = [...list]
        next[idx] = { ...next[idx], required: mode === 'required' }
        return next
      })
    },
    [i18n, updateConsentOptions],
  )

  const saveScale = useCallback(async () => {
    if (!scale) return
    try {
      const likertLabelsEn = settings.likertLabelsEn
        .split(/[,，]/)
        .map(s => s.trim())
        .filter(Boolean)
      const likertLabelsZh = settings.likertLabelsZh
        .split(/[,，]/)
        .map(s => s.trim())
        .filter(Boolean)
      const likertLabelsPayload: Record<string, string[]> = {}
      if (likertLabelsEn.length) likertLabelsPayload.en = likertLabelsEn
      if (likertLabelsZh.length) likertLabelsPayload.zh = likertLabelsZh

      const itemsPerPage = sanitizeNumberInput(settings.itemsPerPage, 0)
      const pointsNumber = sanitizeNumberInput(settings.points, scale.points || 5)

      await adminUpdateScale(scaleId, {
        name_i18n: {
          ...(scale.name_i18n || {}),
          en: settings.nameEn,
          zh: settings.nameZh,
        },
        randomize: !!settings.randomize,
        consent_i18n: scale.consent_i18n,
        collect_email: settings.collectEmail,
        e2ee_enabled: !!scale.e2ee_enabled,
        region: settings.region,
        items_per_page: itemsPerPage,
        turnstile_enabled: !!settings.turnstile,
        likert_labels_i18n: likertLabelsPayload,
        likert_show_numbers: !!settings.likertShowNumbers,
        likert_preset: settings.likertPreset,
        points: pointsNumber,
      } as any)

      dispatch({
        type: 'setScale',
        scale: {
          ...scale,
          name_i18n: {
            ...(scale.name_i18n || {}),
            en: settings.nameEn,
            zh: settings.nameZh,
          },
          collect_email: settings.collectEmail,
          region: settings.region,
          turnstile_enabled: !!settings.turnstile,
          items_per_page: itemsPerPage,
          likert_labels_i18n: likertLabelsPayload,
          likert_show_numbers: !!settings.likertShowNumbers,
          likert_preset: settings.likertPreset,
          points: pointsNumber,
          randomize: !!settings.randomize,
        },
      })

      dispatch({
        type: 'setLikertDefaults',
        defaults: {
          en: settings.likertLabelsEn,
          zh: settings.likertLabelsZh,
          showNumbers: settings.likertShowNumbers,
          preset: settings.likertPreset,
        },
      })
      updateSettings({ points: String(pointsNumber) })
      toast.success(t('save_success'))
    } catch (err: any) {
      toast.error(err?.message || String(err))
    }
  }, [dispatch, scale, scaleId, settings, t, toast, updateSettings])

  const saveConsentConfig = useCallback(async () => {
    if (!scale) return
    try {
      const keys = consent.options.map(o => o.key.trim())
      const hasEmpty = keys.some(k => !k)
      const duplicate = keys.find((k, idx) => k && keys.indexOf(k) !== idx)
      if (hasEmpty || duplicate) {
        toast.error(t('consent.advanced.save_first_error'))
        return
      }

      const payloadOptions = consent.options.map(option => {
        const trimmedKey = option.key.trim()
        const trimmedEn = option.en?.trim() || ''
        const trimmedZh = option.zh?.trim() || ''
        const entry: any = {
          key: trimmedKey,
          required: !!option.required,
        }
        if (trimmedEn || trimmedZh) {
          entry.label_i18n = {
            ...(trimmedEn ? { en: trimmedEn } : {}),
            ...(trimmedZh ? { zh: trimmedZh } : {}),
          }
        }
        if (typeof option.group === 'number' && !Number.isNaN(option.group)) {
          entry.group = option.group
        }
        return entry
      })

      const consentText = {
        en: consent.textEn.trim() ? consent.textEn : undefined,
        zh: consent.textZh.trim() ? consent.textZh : undefined,
      }

      await adminUpdateScale(scaleId, {
        consent_i18n: consentText,
        consent_config: {
          version: consent.version || 'v1',
          options: payloadOptions,
          signature_required: !!consent.signatureRequired,
        },
      } as any)

      dispatch({
        type: 'setScale',
        scale: {
          ...scale,
          consent_i18n: {
            ...(scale.consent_i18n || {}),
            ...(consentText.en !== undefined ? { en: consentText.en } : {}),
            ...(consentText.zh !== undefined ? { zh: consentText.zh } : {}),
          },
          consent_config: {
            version: consent.version || 'v1',
            options: payloadOptions,
            signature_required: !!consent.signatureRequired,
          },
        },
      })

      toast.success(t('save_success'))
    } catch (err: any) {
      toast.error(err?.message || String(err))
    }
  }, [consent, dispatch, scale, scaleId, t, toast])

  // Removed AdvancedConsent component to avoid remount-induced focus loss

  const handleAiPreviewChange = useCallback(
    (
      updater: (current: any | null) => any | null,
    ) => updateAiPreview(updater),
    [updateAiPreview],
  )

  if (!scale) return null

  const consentModeButtons = (key: string) => {
    const current = getOpt(key)
    const mode: ConsentMode = !current ? 'off' : current.required ? 'required' : 'optional'
    return (
      <div className="cta-row" style={{ gap: 8 }}>
        {(['off', 'optional', 'required'] as ConsentMode[]).map(value => (
          <button
            key={value}
            type="button"
            className={`btn ${mode === value ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setOptMode(key, value)}
          >
            {consentModeLabel(value, t)}
          </button>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="row">
        <div className="card span-6">
          <h4 className="section-title" style={{ marginTop: 0 }}>{t('editor.basic_info')}</h4>
          <div className="item">
            <div className="label">{t('name_en')}</div>
            <input
              className="input"
              value={settings.nameEn}
              onChange={e => updateSettings({ nameEn: e.target.value })}
            />
          </div>
          <div className="item">
            <div className="label">{t('name_zh')}</div>
            <input
              className="input"
              value={settings.nameZh}
              onChange={e => updateSettings({ nameZh: e.target.value })}
            />
          </div>
          <div className="item">
            <div className="label">{t('points')}</div>
            <input
              className="input"
              type="number"
              min={1}
              value={settings.points}
              onChange={e => updateSettings({ points: e.target.value })}
            />
          </div>
          <label className="item" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input
              className="checkbox"
              type="checkbox"
              checked={settings.randomize}
              onChange={e => updateSettings({ randomize: e.target.checked })}
            />
            {t('randomize_items')}
          </label>
          <div className="item">
            <div className="label">{t('likert.defaults')}</div>
            <div className="muted" style={{ marginBottom: 6 }}>{t('likert.presets.title')}</div>
            <select
              className="select"
              value={settings.likertPreset}
              onChange={e => {
                const value = e.target.value
                updateSettings({ likertPreset: value })
                if (!value) return
                const preset = LIKERT_PRESETS[value]
                if (!preset) return
                updateSettings({
                  likertPreset: value,
                  likertLabelsEn: preset.en.join(', '),
                  likertLabelsZh: preset.zh.join('，'),
                })
              }}
            >
              <option value="">{t('likert.presets.custom')}</option>
              {Object.keys(LIKERT_PRESETS).map(key => (
                <option key={key} value={key}>
                  {t(`likert.presets.${key}`)}
                </option>
              ))}
            </select>
            <div className="row" style={{ marginTop: 8 }}>
              <div className="card span-6">
                <div className="label">{t('lang_en')}</div>
                <input
                  className="input"
                  value={settings.likertLabelsEn}
                  onChange={e => updateSettings({ likertLabelsEn: e.target.value })}
                  placeholder={t('hint.likert_anchors_en')}
                />
              </div>
              <div className="card span-6">
                <div className="label">{t('lang_zh')}</div>
                <input
                  className="input"
                  value={settings.likertLabelsZh}
                  onChange={e => updateSettings({ likertLabelsZh: e.target.value })}
                  placeholder={t('hint.likert_anchors_zh')}
                />
              </div>
            </div>
            <label className="item" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input
                className="checkbox"
                type="checkbox"
                checked={settings.likertShowNumbers}
                onChange={e => updateSettings({ likertShowNumbers: e.target.checked })}
              />
              {t('likert.show_numbers')}
            </label>
            <div className="muted" style={{ marginTop: 6 }}>{t('likert.apply_hint')}</div>
          </div>
          <div className="cta-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={saveScale}>
              {t('save')}
            </button>
          </div>
        </div>
        <div className="card span-6">
          <h4 className="section-title" style={{ marginTop: 0 }}>{t('editor.security')}</h4>
          <div className="item">
            <div className="label">{t('collect_email')}</div>
            <select
              className="select"
              value={settings.collectEmail}
              onChange={e => updateSettings({ collectEmail: e.target.value as ConsentMode })}
            >
              <option value="off">{t('collect_email_off')}</option>
              <option value="optional">{t('collect_email_optional')}</option>
              <option value="required">{t('collect_email_required')}</option>
            </select>
          </div>
          <label
            className="item"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            title={t('e2ee.locked_after_creation') as string}
          >
            <input className="checkbox" type="checkbox" checked={!!scale.e2ee_enabled} disabled />
            {t('e2ee.title')}
          </label>
          <div className="muted" style={{ marginTop: -4, marginBottom: 8 }}>{t('e2ee.locked_after_creation')}</div>
          <div className="item">
            <div className="label">{t('region')}</div>
            <select
              className="select"
              value={settings.region}
              onChange={e => updateSettings({ region: e.target.value })}
            >
              {['auto', 'gdpr', 'pipl', 'pdpa', 'ccpa'].map(region => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>
          <label className="item" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="checkbox"
              type="checkbox"
              checked={settings.turnstile}
              onChange={e => updateSettings({ turnstile: e.target.checked })}
            />
            {t('turnstile.enable_label')}
          </label>
          <div className="item">
            <div className="label">{t('editor.items_per_page')}</div>
            <input
              className="input"
              type="number"
              value={settings.itemsPerPage}
              onChange={e => updateSettings({ itemsPerPage: e.target.value })}
            />
          </div>
          <div className="cta-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={saveScale}>
              {t('save')}
            </button>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="card span-6">
          <h4 className="section-title" style={{ marginTop: 0 }}>{t('consent_settings')}</h4>
          <div className="tile" style={{ padding: 10, marginBottom: 8 }}>
            <div className="muted" style={{ marginBottom: 6 }}>{t('consent.presets_title')}</div>
            <div className="cta-row">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  applyConsentOptions([
                    { key: 'withdrawal', required: true },
                    { key: 'data_use', required: true },
                    { key: 'recording', required: false },
                  ])
                }
              >
                {t('consent.preset_min')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  applyConsentOptions([
                    { key: 'withdrawal', required: true },
                    { key: 'data_use', required: true },
                    { key: 'recording', required: false },
                  ])
                  updateConsent({ signatureRequired: true })
                }}
              >
                {t('consent.preset_rec')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  applyConsentOptions([
                    { key: 'withdrawal', required: true },
                    { key: 'data_use', required: true },
                    { key: 'recording', required: true },
                  ])
                  updateConsent({ signatureRequired: true })
                }}
              >
                {t('consent.preset_strict')}
              </button>
            </div>
          </div>
          <div className="tile" style={{ padding: 10 }}>
            <div className="muted" style={{ marginBottom: 6 }}>{t('consent.simple_title')}</div>
            <label className="item" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <input
                className="checkbox"
                type="checkbox"
                checked={consent.signatureRequired}
                onChange={e => updateConsent({ signatureRequired: e.target.checked })}
              />
              {t('consent.require_signature')}
            </label>
            <div className="item" style={{ marginBottom: 6 }}>
              <div className="label">{t('label.version')}</div>
              <input
                className="input"
                value={consent.version}
                onChange={e => updateConsent({ version: e.target.value })}
              />
            </div>
            {CONSENT_PRESETS.map(row => (
              <div key={row.key} className="item" style={{ display: 'grid', gap: 6 }}>
                <div className="label">{t(row.label)}</div>
                {consentModeButtons(row.key)}
              </div>
            ))}
            <div className="cta-row" style={{ marginTop: 8, gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={saveConsentConfig}>
                {t('save')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => updateConsent({ advancedOpen: !consent.advancedOpen })}
              >
                {consent.advancedOpen ? t('consent.hide_advanced') : t('consent.show_advanced')}
              </button>
            </div>
            {consent.advancedOpen && (
              <div className="tile" style={{ padding: 16, marginTop: 8 }}>
                <div className="row">
                  <div className="card span-6">
                    <div className="label">{t('consent_en')}</div>
                    <textarea
                      className="input"
                      rows={4}
                      value={consent.textEn}
                      onChange={e => updateConsent({ textEn: e.target.value })}
                      placeholder={t('consent_hint') as string}
                    />
                  </div>
                  <div className="card span-6">
                    <div className="label">{t('consent_zh')}</div>
                    <textarea
                      className="input"
                      rows={4}
                      value={consent.textZh}
                      onChange={e => updateConsent({ textZh: e.target.value })}
                      placeholder={t('consent_hint') as string}
                    />
                  </div>
                </div>
                <div className="muted" style={{ marginTop: 8 }}>{t('consent.inline_hint')}</div>
                <div className="muted" style={{ marginBottom: 12 }}>{t('consent.group_hint')}</div>
                <div className="muted" style={{ marginBottom: 12 }}>{t('consent_md_hint')}</div>
                <table className="consent-table">
                  <thead>
                    <tr>
                      <th>{t('consent.advanced.label_en')}</th>
                      <th>{t('consent.advanced.label_zh')}</th>
                      <th>{t('consent.advanced.group')}</th>
                      <th>{t('consent.advanced.required')}</th>
                      <th>{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consent.options.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted">
                          {t('consent.advanced.empty')}
                        </td>
                      </tr>
                    )}
                    {consent.options.map((option, idx) => (
                      <tr key={option.key || idx}>
                        <td data-label={t('consent.advanced.label_en')}>
                          <input
                            className="input"
                            value={option.en || ''}
                            onChange={e =>
                              updateConsentOptions(list =>
                                list.map((entry, i) => (i === idx ? { ...entry, en: e.target.value } : entry)),
                              )
                            }
                            placeholder={t('optional')}
                          />
                        </td>
                        <td data-label={t('consent.advanced.label_zh')}>
                          <input
                            className="input"
                            value={option.zh || ''}
                            onChange={e =>
                              updateConsentOptions(list =>
                                list.map((entry, i) => (i === idx ? { ...entry, zh: e.target.value } : entry)),
                              )
                            }
                            placeholder={t('optional')}
                          />
                        </td>
                        <td data-label={t('consent.advanced.group')}>
                          <input
                            className="input"
                            type="number"
                            value={option.group ?? ''}
                            onChange={e => {
                              const raw = e.target.value
                              updateConsentOptions(list =>
                                list.map((entry, i) => {
                                  if (i !== idx) return entry
                                  if (!raw.trim()) return { ...entry, group: undefined }
                                  const parsed = Number(raw)
                                  if (Number.isNaN(parsed)) return entry
                                  return { ...entry, group: parsed }
                                }),
                              )
                            }}
                          />
                        </td>
                        <td data-label={t('consent.advanced.required')}>
                          <label className="toggle">
                            <input
                              className="checkbox"
                              type="checkbox"
                              checked={!!option.required}
                              onChange={e =>
                                updateConsentOptions(list =>
                                  list.map((entry, i) => (i === idx ? { ...entry, required: e.target.checked } : entry)),
                                )
                              }
                            />
                          </label>
                        </td>
                        <td>
                          <div className="cta-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() =>
                                updateConsentOptions(list => {
                                  const target = idx - 1
                                  if (target < 0) return list
                                  const next = [...list]
                                  const temp = next[idx]
                                  next[idx] = next[target]
                                  next[target] = temp
                                  return next
                                })
                              }
                              disabled={idx === 0}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() =>
                                updateConsentOptions(list => {
                                  const target = idx + 1
                                  if (target >= list.length) return list
                                  const next = [...list]
                                  const temp = next[idx]
                                  next[idx] = next[target]
                                  next[target] = temp
                                  return next
                                })
                              }
                              disabled={idx === consent.options.length - 1}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => updateConsentOptions(list => list.filter((_, i) => i !== idx))}
                            >
                              {t('delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="cta-row" style={{ marginTop: 12 }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() =>
                      updateConsentOptions(list => [
                        ...list,
                        { key: `custom_${Date.now()}_${Math.floor(Math.random() * 1_000)}`, required: false },
                      ])
                    }
                  >
                    {t('consent.advanced.add_option')}
                  </button>
                  <button className="btn btn-primary" type="button" onClick={saveConsentConfig}>
                    {t('save')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="row">
        <div className="card span-6">
          <h4 className="section-title" style={{ marginTop: 0 }}>{t('ai.title')}</h4>
          <div className="muted" style={{ marginBottom: 8 }}>{t('ai.steps')}</div>
          <div className="item">
            <div className="label">{t('ai.targets')}</div>
            <input
              className="input"
              value={ai.targets}
              onChange={e => setAiState({ targets: e.target.value })}
              placeholder="zh, en"
            />
          </div>
          <div className="cta-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn-ghost" type="button" onClick={() => setAiState({ targets: 'zh' })}>
              EN→ZH
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setAiState({ targets: 'en' })}>
              ZH→EN
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setAiState({ targets: 'zh,en,fr,de' })}
            >
              +Common
            </button>
            <a className="btn btn-ghost" href="/admin/ai" target="_blank" rel="noreferrer">
              {t('ai.provider')}
            </a>
            <button
              type="button"
              className="btn"
              disabled={!ai.ready || ai.working}
              onClick={async () => {
                setAiState({ msg: '', preview: null, working: true })
                try {
                  const langs = ai.targets
                    .split(/[,\s]+/)
                    .map(s => s.trim())
                    .filter(Boolean)
                  const res = await adminAITranslatePreview(scaleId, langs)
                  updateAiPreview(() => res)
                  const defaults: Record<string, boolean> = {}
                  for (const item of items) defaults[item.id] = true
                  setAiInclude(defaults)
                } catch (err: any) {
                  setAiState({ msg: err?.message || String(err) })
                  toast.error(err?.message || String(err))
                } finally {
                  setAiState({ working: false })
                }
              }}
            >
              {ai.working ? t('working') : t('preview')}
            </button>
          </div>
          {!ai.ready && (
            <div
              className="tile"
              style={{
                padding: 10,
                border: '1px solid rgba(255,191,71,0.45)',
                background: 'rgba(255,240,200,0.15)',
                color: 'var(--muted)',
                marginTop: 8,
                display: 'grid',
                gap: 8,
              }}
            >
              <div>{t('ai.not_ready')}</div>
              <div className="cta-row" style={{ justifyContent: 'flex-start' }}>
                <Link className="btn btn-ghost" to="/admin/ai">
                  {t('ai.not_ready_link')}
                </Link>
              </div>
            </div>
          )}
        </div>
        <div className="card span-6">
          <h4 className="section-title" style={{ marginTop: 0 }}>{t('ai.preview_title')}</h4>
          {ai.preview && (
            <div className="tile" style={{ padding: 10, marginTop: 8 }}>
              <div className="muted" style={{ marginBottom: 8 }}>{t('ai.review')}</div>
              {Object.entries(ai.preview.name_i18n || {}).length > 0 && (
                <div className="item" style={{ display: 'grid', gap: 6 }}>
                  <div className="label">{t('create_scale')}</div>
                  <div className="row" style={{ gap: 8 }}>
                    {Object.entries(ai.preview.name_i18n).map(([lang, value]) => (
                      <div key={lang} className="card span-6" style={{ minWidth: 200 }}>
                        <div className="label">{lang}</div>
                        <textarea
                          className="input"
                          rows={2}
                          defaultValue={value as string}
                          onChange={e =>
                            handleAiPreviewChange(prev => ({
                              ...(prev || {}),
                              name_i18n: {
                                ...(prev?.name_i18n || {}),
                                [lang]: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Object.entries(ai.preview.consent_i18n || {}).length > 0 && (
                <div className="item" style={{ display: 'grid', gap: 6 }}>
                  <div className="label">{t('consent_settings')}</div>
                  <div className="row" style={{ gap: 8 }}>
                    {Object.entries(ai.preview.consent_i18n).map(([lang, value]) => (
                      <div key={lang} className="card span-6" style={{ minWidth: 200 }}>
                        <div className="label">{lang}</div>
                        <textarea
                          className="input"
                          rows={2}
                          defaultValue={value as string}
                          onChange={e =>
                            handleAiPreviewChange(prev => ({
                              ...(prev || {}),
                              consent_i18n: {
                                ...(prev?.consent_i18n || {}),
                                [lang]: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="muted" style={{ marginBottom: 8 }}>{t('editor.your_items')}</div>
              {items.map(item => {
                const previewForItem = (ai.preview.items || {})[item.id] || {}
                if (Object.keys(previewForItem).length === 0) return null
                return (
                  <div key={item.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <input
                          className="checkbox"
                          type="checkbox"
                          checked={!!ai.include[item.id]}
                          onChange={e => setAiInclude({ ...ai.include, [item.id]: e.target.checked })}
                        />
                        <span>{t('ai.include_label')}</span>
                      </label>
                      <div>
                        <b>{item.id}</b> · {item.stem_i18n?.en || item.stem || item.id}
                      </div>
                    </div>
                    <div className="row" style={{ marginTop: 8 }}>
                      {Object.entries(previewForItem).map(([lang, value]) => (
                        <div key={lang} className="card span-6" style={{ minWidth: 260 }}>
                          <div className="label">{lang}</div>
                          <textarea
                            className="input"
                            rows={3}
                            defaultValue={value as string}
                            onChange={e =>
                              handleAiPreviewChange(prev => ({
                                ...(prev || {}),
                                items: {
                                  ...(prev?.items || {}),
                                  [item.id]: {
                                    ...(prev?.items?.[item.id] || {}),
                                    [lang]: e.target.value,
                                  },
                                },
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              <div className="cta-row" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={ai.applying}
                  onClick={async () => {
                    setAiState({ applying: true })
                    try {
                      for (const item of items) {
                        if (!ai.include[item.id]) continue
                        const additions = (ai.preview.items || {})[item.id] || {}
                        if (Object.keys(additions).length === 0) continue
                        await adminUpdateItem(item.id, {
                          stem_i18n: {
                            ...(item.stem_i18n || {}),
                            ...(additions as any),
                          },
                        })
                      }
                      const scaleUpdates: any = {}
                      if (ai.preview.name_i18n) {
                        scaleUpdates.name_i18n = {
                          ...(scale.name_i18n || {}),
                          ...(ai.preview.name_i18n as Record<string, string>),
                        }
                      }
                      if (ai.preview.consent_i18n) {
                        scaleUpdates.consent_i18n = {
                          ...(scale.consent_i18n || {}),
                          ...(ai.preview.consent_i18n as Record<string, string>),
                        }
                      }
                      if (Object.keys(scaleUpdates).length > 0) {
                        await adminUpdateScale(scaleId, scaleUpdates)
                      }
                      toast.success(t('save_success'))
                      updateAiPreview(() => null)
                      setAiInclude({})
                      await reload()
                    } catch (err: any) {
                      setAiState({ msg: err?.message || String(err) })
                      toast.error(err?.message || String(err))
                    } finally {
                      setAiState({ applying: false })
                    }
                  }}
                >
                  {ai.applying ? t('working') : t('apply')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    updateAiPreview(() => null)
                    setAiInclude({})
                  }}
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          )}
          {ai.msg && <div className="muted" style={{ marginTop: 6 }}>{ai.msg}</div>}
        </div>
      </div>
      <div className="row">
        <CollaboratorsPanel />
      </div>
      <DangerZone />
    </>
  )
}

export default SettingsView
