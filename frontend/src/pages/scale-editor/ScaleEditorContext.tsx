import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react'
import {
  adminAnalyticsSummary,
  adminGetScale,
  adminGetScaleItems,
} from '../../api/client'
import {
  createInitialAIState,
  createInitialState,
  deriveConsentFromScale,
  deriveLikertDefaults,
  deriveSettingsFromScale,
  scaleEditorReducer,
  ScaleEditorAction,
  ScaleEditorState,
} from './state'

interface ScaleEditorContextValue {
  state: ScaleEditorState
  dispatch: React.Dispatch<ScaleEditorAction>
  scaleId: string
  reload: () => Promise<void>
}

const ScaleEditorContext = createContext<ScaleEditorContextValue | undefined>(
  undefined,
)

export const ScaleEditorProvider: React.FC<{
  scaleId: string
  children: React.ReactNode
}> = ({ scaleId, children }) => {
  const [state, dispatch] = useReducer(scaleEditorReducer, undefined, createInitialState)

  const reload = useCallback(async () => {
    dispatch({ type: 'setMessage', message: '' })
    dispatch({ type: 'setLoading', value: true })
    try {
      const [scaleRes, itemsRes] = await Promise.all([
        adminGetScale(scaleId),
        adminGetScaleItems(scaleId),
      ])
      dispatch({ type: 'setScale', scale: scaleRes })
      dispatch({
        type: 'setLikertDefaults',
        defaults: deriveLikertDefaults(scaleRes),
      })
      dispatch({
        type: 'replaceSettings',
        payload: deriveSettingsFromScale(scaleRes),
      })
      dispatch({
        type: 'replaceConsent',
        payload: deriveConsentFromScale(scaleRes),
      })
      dispatch({ type: 'setAiState', payload: createInitialAIState() })
      dispatch({ type: 'setItems', items: itemsRes.items || [] })
      try {
        const analyticsRes = await adminAnalyticsSummary(scaleId)
        dispatch({ type: 'setAnalytics', analytics: analyticsRes })
      } catch {
        dispatch({ type: 'setAnalytics', analytics: null })
      }
    } catch (err: any) {
      dispatch({ type: 'setScale', scale: null })
      dispatch({ type: 'setItems', items: [] })
      dispatch({ type: 'setAnalytics', analytics: null })
      dispatch({
        type: 'setLikertDefaults',
        defaults: deriveLikertDefaults(null),
      })
      dispatch({
        type: 'replaceSettings',
        payload: deriveSettingsFromScale(null),
      })
      dispatch({
        type: 'replaceConsent',
        payload: deriveConsentFromScale(null),
      })
      dispatch({ type: 'setAiState', payload: createInitialAIState() })
      dispatch({ type: 'setMessage', message: err?.message || String(err) })
    } finally {
      dispatch({ type: 'setLoading', value: false })
    }
  }, [scaleId])

  useEffect(() => {
    reload()
  }, [reload])

  const value = useMemo(
    () => ({ state, dispatch, scaleId, reload }),
    [state, scaleId, reload],
  )

  return (
    <ScaleEditorContext.Provider value={value}>
      {children}
    </ScaleEditorContext.Provider>
  )
}

export const useScaleEditor = (): ScaleEditorContextValue => {
  const ctx = useContext(ScaleEditorContext)
  if (!ctx) throw new Error('useScaleEditor must be used inside ScaleEditorProvider')
  return ctx
}

export const useScaleEditorState = () => useScaleEditor().state
