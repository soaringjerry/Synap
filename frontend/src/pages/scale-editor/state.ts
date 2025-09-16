import { ScaleEditorView } from './types'

export type LikertDefaults = {
  en: string
  zh: string
  showNumbers: boolean
  preset: string
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

export const createInitialState = (): ScaleEditorState => ({
  scale: null,
  items: [],
  analytics: null,
  view: 'editor',
  selectedItemId: null,
  message: '',
  likertDefaults: {
    en: '',
    zh: '',
    showNumbers: true,
    preset: 'numeric',
  },
  loading: false,
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
      const nextSelected = state.selectedItemId && nextItems.some(it => it?.id === state.selectedItemId)
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
    default:
      return state
  }
}
