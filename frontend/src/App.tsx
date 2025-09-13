import { createBrowserRouter, RouterProvider, Link, Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { VersionBadge } from './components/VersionBadge'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { Home } from './pages/Home'
import { CookieBanner } from './components/CookieBanner'
import { Privacy } from './pages/Privacy'
import { Terms } from './pages/Terms'
import { Admin } from './pages/Admin'
import { Auth } from './pages/Auth'
import { Survey } from './pages/Survey'

import React from 'react'
import { useTranslation } from 'react-i18next'

function useAuthStatus() {
  const [authed, setAuthed] = React.useState<boolean>(() => !!localStorage.getItem('token'))
  const loc = useLocation()
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'token') setAuthed(!!e.newValue) }
    window.addEventListener('storage', onStorage)
    // Also refresh auth state on route changes (same‑tab login/logout)
    setAuthed(!!localStorage.getItem('token'))
    return () => window.removeEventListener('storage', onStorage)
  }, [loc.pathname])
  return { authed, setAuthed }
}

async function logout(setAuthed: (b:boolean)=>void, navigate: (path:string)=>void) {
  try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
  localStorage.removeItem('token')
  setAuthed(false)
  navigate('/auth')
}

function RootLayout() {
  const { authed, setAuthed } = useAuthStatus()
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <>
      <header className="app-header">
        <div className="brand">Synap</div>
        <div className="nav-actions">
          <Link className="btn btn-ghost" to="/">{t('nav.home')}</Link>
          <Link className="btn btn-ghost" to="/admin">{t('nav.admin')}</Link>
          {/* Moved Privacy / Terms / Cookies to footer for cleaner header */}
          {authed ? (
            <button className="btn" onClick={()=>logout(setAuthed, navigate)}>{t('nav.logout')}</button>
          ) : (
            <Link className="btn" to="/auth">{t('nav.auth')}</Link>
          )}
          <LanguageSwitcher />
          <VersionBadge />
        </div>
      </header>
      <main className="page">
        <div className="container">
          <Outlet />
        </div>
      </main>
      <footer className="app-footer">
        <div className="container" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div className="muted">© 2025 Synap · GDPR & PDPA aligned · Data in Singapore · Cloudflare CDN</div>
          <div style={{display:'flex',gap:8}}>
            <Link className="btn btn-ghost" to="/legal/privacy">Privacy</Link>
            <Link className="btn btn-ghost" to="/legal/terms">Terms</Link>
            <button className="btn btn-ghost" onClick={()=> (window as any).openCookiePrefs?.() }>Cookies</button>
          </div>
        </div>
      </footer>
      <CookieBanner />
    </>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const loc = useLocation()
  if (!token) return <Navigate to="/auth" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

const router = createBrowserRouter([
  { element: <RootLayout/>, children: [
    { path: '/', element: <Home/> },
    { path: '/admin', element: <Protected><Admin/></Protected> },
    { path: '/auth', element: <Auth/> },
    { path: '/survey/:scaleId', element: <Survey/> },
    { path: '/legal/privacy', element: <Privacy/> },
    { path: '/legal/terms', element: <Terms/> },
  ]}
])

export function App() {
  return (
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  )
}
