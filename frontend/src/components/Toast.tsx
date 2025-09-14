import React from 'react'
import { createPortal } from 'react-dom'

type ToastKind = 'success' | 'error' | 'info'
type ToastItem = { id: number; kind: ToastKind; text: string }

type ToastAPI = {
  success: (text: string) => void
  error: (text: string) => void
  info: (text: string) => void
}

const ToastContext = React.createContext<ToastAPI>({
  success: () => {},
  error: () => {},
  info: () => {},
})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])
  const idRef = React.useRef(1)

  const push = React.useCallback((kind: ToastKind, text: string) => {
    const id = idRef.current++
    setToasts(list => [...list, { id, kind, text }])
    window.setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), 3000)
  }, [])

  const api = React.useMemo<ToastAPI>(() => ({
    success: (text: string) => push('success', text),
    error: (text: string) => push('error', text),
    info: (text: string) => push('info', text),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toast-container" role="status" aria-live="polite">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              <div className="toast-icon" aria-hidden>•</div>
              <div className="toast-text">{t.text}</div>
              <button className="toast-close" onClick={()=> setToasts(list=> list.filter(x=> x.id!==t.id))} aria-label="Close">×</button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return React.useContext(ToastContext)
}

