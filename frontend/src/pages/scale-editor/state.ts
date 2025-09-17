import { ScaleEditorView } from './types'

export type CollectEmailMode = 'off' | 'optional' | 'required'

export type LikertDefaults = {
  en: string
  zh: string
  showNumbers: boolean
  preset: string
}

export type ConsentOptionForm = {
  key: string
  required: boolean
  en?: string
  zh?: string
  group?: number
}

export type ScaleEditorSettingsState = {
  nameEn: string
  nameZh: string
  points: string
  randomize: boolean
  collectEmail: CollectEmailMode
  region: string
  turnstile: boolean
  itemsPerPage: string
  likertPreset: string
  likertLabelsEn: string
  likertLabelsZh: string
  likertShowNumbers: boolean
}

export type ScaleEditorConsentState = {
  version: string
  signatureRequired: boolean
  options: ConsentOptionForm[]
  textEn: string
  textZh: string
  advancedOpen: boolean
}

export type ScaleEditorAIState = {
  targets: string
  preview: any | null
  msg: string
  ready: boolean
  working: boolean
  include: Record<string, boolean>
  applying: boolean
}

export interface ScaleEditorState {
  scale: any | null
  items: any[]
  analytics: any | null
  view: ScaleEditorView
  selectedItemId: string | null
  message: string
  likertDefaults: LikertDefaults
  loading: boolean
  settings: ScaleEditorSettingsState
  consent: ScaleEditorConsentState
  ai: ScaleEditorAIState
}

export type ScaleEditorAction =
  | { type: 'reset' }
  | { type: 'setView'; view: ScaleEditorView }
  | { type: 'setScale'; scale: any | null }
  | { type: 'setItems'; items: any[] }
  | { type: 'selectItem'; itemId: string | null }
  | { type: 'mutateItem'; itemId: string; updater: (item: any) => any }
  | { type: 'appendItem'; item: any }
  | { type: 'removeItem'; itemId: string }
  | { type: 'setAnalytics'; analytics: any | null }
  | { type: 'setMessage'; message: string }
  | { type: 'setLikertDefaults'; defaults: LikertDefaults }
  | { type: 'setLoading'; value: boolean }
  | { type: 'reorderItems'; order: string[] }
  | { type: 'replaceSettings'; payload: ScaleEditorSettingsState }
  | { type: 'setSettings'; payload: Partial<ScaleEditorSettingsState> }
  | { type: 'replaceConsent'; payload: ScaleEditorConsentState }
  | { type: 'setConsent'; payload: Partial<Omit<ScaleEditorConsentState, 'options'>> }
  | { type: 'setConsentOptions'; options: ConsentOptionForm[] }
  | { type: 'setAiState'; payload: Partial<ScaleEditorAIState> }
  | { type: 'setAiInclude'; include: Record<string, boolean> }
  | { type: 'updateAiPreview'; updater: (prev: any | null) => any | null }

const createEmptySettings = (): ScaleEditorSettingsState => ({
  nameEn: '',
  nameZh: '',
  points: '5',
  randomize: false,
  collectEmail: 'off',
  region: 'auto',
  turnstile: false,
  itemsPerPage: '0',
  likertPreset: 'numeric',
  likertLabelsEn: '',
  likertLabelsZh: '',
  likertShowNumbers: true,
})

const createEmptyConsent = (): ScaleEditorConsentState => ({
  version: 'v1',
  signatureRequired: false,
  options: [],
  textEn: '',
  textZh: '',
  advancedOpen: false,
})

export const createInitialAIState = (): ScaleEditorAIState => ({
  targets: 'zh',
  preview: null,
  msg: '',
  ready: false,
  working: false,
  include: {},
  applying: false,
})

export const deriveLikertDefaults = (scale: any | null): LikertDefaults => {
  const labels = (scale?.likert_labels_i18n || {}) as Record<string, string[]>
  const en = Array.isArray(labels.en) ? labels.en.join(', ') : ''
  const zh = Array.isArray(labels.zh) ? labels.zh.join('，') : ''
  return {
    en,
    zh,
    showNumbers: !!scale?.likert_show_numbers,
    preset: scale?.likert_preset || 'numeric',
  }
}

export const deriveSettingsFromScale = (
  scale: any | null,
): ScaleEditorSettingsState => {
  const settings = createEmptySettings()
  if (!scale) return settings

  const likert = deriveLikertDefaults(scale)
  const collectEmail = (scale.collect_email as CollectEmailMode) || settings.collectEmail

  return {
    ...settings,
    nameEn: scale.name_i18n?.en || '',
    nameZh: scale.name_i18n?.zh || '',
    points: typeof scale.points === 'number' ? String(scale.points) : settings.points,
    randomize: !!scale.randomize,
    collectEmail,
    region: scale.region || settings.region,
    turnstile: !!scale.turnstile_enabled,
    itemsPerPage: typeof scale.items_per_page === 'number'
      ? String(scale.items_per_page)
      : settings.itemsPerPage,
    likertPreset: likert.preset || settings.likertPreset,
    likertLabelsEn: likert.en,
    likertLabelsZh: likert.zh,
    likertShowNumbers: likert.showNumbers,
  }
}

export const deriveConsentFromScale = (
  scale: any | null,
): ScaleEditorConsentState => {
  const consent = createEmptyConsent()
  if (!scale) return consent

  const config = scale.consent_config || {}
  const parseBool = (v: any, fb: boolean): boolean => {
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v !== 0
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase()
      if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true
      if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false
    }
    return fb
  }
  const options = Array.isArray(config.options)
    ? config.options.map((option: any) => {
        let group: number | undefined
        if (typeof option.group === 'number') {
          group = option.group
        } else if (typeof option.group === 'string' && option.group.trim() !== '') {
          const parsed = Number(option.group)
          if (!Number.isNaN(parsed)) group = parsed
        }
        return {
          key: option.key || '',
          required: !!option.required,
          en: option.label_i18n?.en,
          zh: option.label_i18n?.zh,
          group,
        }
      })
    : []

  return {
    ...consent,
    version: config.version || consent.version,
    signatureRequired: parseBool(config.signature_required, consent.signatureRequired),
    options,
    textEn: scale.consent_i18n?.en || '',
    textZh: scale.consent_i18n?.zh || '',
    advancedOpen: false,
  }
}

export const createInitialState = (): ScaleEditorState => {
  const likertDefaults = deriveLikertDefaults(null)
  return {
    scale: null,
    items: [],
    analytics: null,
    view: 'editor',
    selectedItemId: null,
    message: '',
    likertDefaults,
    loading: false,
    settings: deriveSettingsFromScale(null),
    consent: deriveConsentFromScale(null),
    ai: createInitialAIState(),
  }
}

export const scaleEditorReducer = (
  state: ScaleEditorState,
  action: ScaleEditorAction,
): ScaleEditorState => {
  switch (action.type) {
    case 'setView':
      return { ...state, view: action.view }
    case 'reset':
      return createInitialState()
    case 'setScale':
      return { ...state, scale: action.scale }
    case 'setItems': {
      const nextItems = Array.isArray(action.items) ? [...action.items] : []
      const nextSelected =
        state.selectedItemId && nextItems.some(it => it?.id === state.selectedItemId)
          ? state.selectedItemId
          : null
      return { ...state, items: nextItems, selectedItemId: nextSelected }
    }
    case 'selectItem':
      return { ...state, selectedItemId: action.itemId }
    case 'mutateItem': {
      return {
        ...state,
        items: state.items.map(it => {
          if (!it || it.id !== action.itemId) return it
          const updated = action.updater(it)
          return updated || it
        }),
      }
    }
    case 'appendItem':
      return { ...state, items: [...state.items, action.item] }
    case 'removeItem': {
      const nextItems = state.items.filter(it => it?.id !== action.itemId)
      const nextSelected = state.selectedItemId === action.itemId ? null : state.selectedItemId
      return { ...state, items: nextItems, selectedItemId: nextSelected }
    }
    case 'setAnalytics':
      return { ...state, analytics: action.analytics }
    case 'setMessage':
      return { ...state, message: action.message }
    case 'setLikertDefaults':
      return { ...state, likertDefaults: action.defaults }
    case 'setLoading':
      return { ...state, loading: action.value }
    case 'reorderItems': {
      const order = Array.isArray(action.order) ? [...action.order] : []
      if (order.length === 0) return state
      const lookup = new Map(state.items.map(it => [it?.id, it]))
      const seen = new Set<string>()
      const nextItems: any[] = []
      for (const itemId of order) {
        const entry = lookup.get(itemId)
        if (entry && !seen.has(itemId)) {
          nextItems.push(entry)
          seen.add(itemId)
        }
      }
      state.items.forEach(it => {
        if (!it?.id) return
        if (!seen.has(it.id)) nextItems.push(it)
      })
      return { ...state, items: nextItems }
    }
    case 'replaceSettings':
      return { ...state, settings: { ...action.payload } }
    case 'setSettings':
      return { ...state, settings: { ...state.settings, ...action.payload } }
    case 'replaceConsent':
      return { ...state, consent: { ...action.payload } }
    case 'setConsent':
      return { ...state, consent: { ...state.consent, ...action.payload } }
    case 'setConsentOptions':
      return { ...state, consent: { ...state.consent, options: [...action.options] } }
    case 'setAiState':
      return { ...state, ai: { ...state.ai, ...action.payload } }
    case 'setAiInclude':
      return { ...state, ai: { ...state.ai, include: { ...action.include } } }
    case 'updateAiPreview':
      return { ...state, ai: { ...state.ai, preview: action.updater(state.ai.preview) } }
    default:
      return state
  }
}
