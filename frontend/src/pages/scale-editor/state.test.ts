import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  deriveConsentFromScale,
  scaleEditorReducer,
} from './state'

type State = ReturnType<typeof createInitialState>
type TestItem = { id: string; [key: string]: unknown }

describe('scaleEditorReducer', () => {
  it('resets to initial state', () => {
    const mutated: State = { ...createInitialState(), view: 'share', message: 'hi' }
    const next = scaleEditorReducer(mutated, { type: 'reset' })
    expect(next).toEqual(createInitialState())
  })

  it('switches active view', () => {
    const initial = createInitialState()
    const next = scaleEditorReducer(initial, { type: 'setView', view: 'settings' })
    expect(next.view).toBe('settings')
  })

  it('stores scale payload', () => {
    const state = createInitialState()
    const next = scaleEditorReducer(state, { type: 'setScale', scale: { id: 'scale-1' } })
    expect(next.scale).toEqual({ id: 'scale-1' })
  })

  it('updates items and prunes missing selection', () => {
    const initial: State = {
      ...createInitialState(),
      items: [{ id: 'keep' }, { id: 'drop' }] as TestItem[],
      selectedItemId: 'drop',
    }
    const next = scaleEditorReducer(initial, { type: 'setItems', items: [{ id: 'keep' }] })
    expect(next.items).toEqual([{ id: 'keep' }])
    expect(next.selectedItemId).toBeNull()
  })

  it('keeps selection when still present after setItems', () => {
    const initial: State = {
      ...createInitialState(),
      items: [{ id: 'stay' }] as TestItem[],
      selectedItemId: 'stay',
    }
    const next = scaleEditorReducer(initial, { type: 'setItems', items: [{ id: 'stay' }] })
    expect(next.selectedItemId).toBe('stay')
  })

  it('writes selected item id', () => {
    const initial = createInitialState()
    const next = scaleEditorReducer(initial, { type: 'selectItem', itemId: 'item-1' })
    expect(next.selectedItemId).toBe('item-1')
  })

  it('mutates existing item via updater', () => {
    const initial: State = {
      ...createInitialState(),
      items: [{ id: 'item-1', stem: 'before' }] as TestItem[],
    }
    const next = scaleEditorReducer(initial, {
      type: 'mutateItem',
      itemId: 'item-1',
      updater: item => ({ ...item, stem: 'after' }),
    })
    expect(next.items[0]).toMatchObject({ stem: 'after' })
  })

  it('appends a new item', () => {
    const initial = createInitialState()
    const next = scaleEditorReducer(initial, { type: 'appendItem', item: { id: 'new' } })
    expect(next.items).toHaveLength(1)
    expect(next.items[0]).toMatchObject({ id: 'new' })
  })

  it('removes item and clears selection when deleted', () => {
    const initial: State = {
      ...createInitialState(),
      items: [{ id: 'keep' }, { id: 'remove' }] as TestItem[],
      selectedItemId: 'remove',
    }
    const next = scaleEditorReducer(initial, { type: 'removeItem', itemId: 'remove' })
    expect(next.items).toEqual([{ id: 'keep' }])
    expect(next.selectedItemId).toBeNull()
  })

  it('stores analytics payload', () => {
    const initial = createInitialState()
    const payload = { total_responses: 3 }
    const next = scaleEditorReducer(initial, { type: 'setAnalytics', analytics: payload })
    expect(next.analytics).toEqual(payload)
  })

  it('sets status message', () => {
    const initial = createInitialState()
    const next = scaleEditorReducer(initial, { type: 'setMessage', message: 'Saved' })
    expect(next.message).toBe('Saved')
  })

  it('replaces likert defaults', () => {
    const initial = createInitialState()
    const next = scaleEditorReducer(initial, {
      type: 'setLikertDefaults',
      defaults: { en: '1,2,3', zh: '一,二,三', showNumbers: false, preset: 'custom' },
    })
    expect(next.likertDefaults).toEqual({ en: '1,2,3', zh: '一,二,三', showNumbers: false, preset: 'custom' })
  })

  it('toggles loading flag', () => {
    const initial = createInitialState()
    const next = scaleEditorReducer(initial, { type: 'setLoading', value: true })
    expect(next.loading).toBe(true)
  })

  it('reorders items respecting provided order', () => {
    const initial: State = {
      ...createInitialState(),
      items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as TestItem[],
    }
    const next = scaleEditorReducer(initial, { type: 'reorderItems', order: ['c', 'a'] })
    expect(next.items).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }])
  })

  it('derives consent state keeping signature_required=false from backend', () => {
    const scale = {
      consent_config: {
        signature_required: false,
        options: [],
      },
      consent_i18n: {},
    }
    const consent = deriveConsentFromScale(scale)
    expect(consent.signatureRequired).toBe(false)
  })
})
