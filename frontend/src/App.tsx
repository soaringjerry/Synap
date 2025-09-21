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
import { AdminScale } from './pages/AdminScale'
import { ScaleEditor } from './pages/ScaleEditor'
import { AdminKeys } from './pages/AdminKeys'
import { AdminAI } from './pages/AdminAI'
import { SelfManage } from './pages/SelfManage'

import React from 'react'
import { ToastProvider } from './components/Toast'
import { useTranslation } from 'react-i18next'

function useServerAuth() {
  const [authed, setAuthed] = React.useState<boolean>(false)
  const [loading, setLoading] = React.useState(true)
  const [user, setUser] = React.useState<{user_id:string;tenant_id:string;email:string}|null>(null)
  const loc = useLocation()
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/auth/me', { headers: { 'Accept': 'application/json' } })
        if (!res.ok) { setAuthed(false); setUser(null); return }
        const data = await res.json()
        if (!cancelled) { setUser(data); setAuthed(true) }
      } catch {
        if (!cancelled) { setAuthed(false); setUser(null) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [loc.pathname])
  return { authed, loading, user, setAuthed }
}

async function logout(setAuthed: (b:boolean)=>void, navigate: (path:string)=>void) {
  try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
  localStorage.removeItem('token')
  setAuthed(false)
  navigate('/auth')
}

function RootLayout() {
  const { authed, setAuthed } = useServerAuth() as any
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = React.useState(false)

  React.useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const closeMenu = React.useCallback(() => setMenuOpen(false), [])
  return (
    <>
      <header className="app-header">
        <div className="left-actions">
          <Link className="brand" to="/">Synap</Link>
        </div>
        <div className="nav-actions">
          <button
            className={`menu-toggle ${menuOpen ? 'open' : ''}`}
            type="button"
            aria-label={menuOpen ? t('nav.close_menu') || 'Close menu' : t('nav.open_menu') || 'Open menu'}
            aria-expanded={menuOpen}
            onClick={()=> setMenuOpen(o => !o)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div className={`nav-menu ${menuOpen ? 'open' : ''}`}>
            <Link className="btn btn-ghost" to="/" onClick={closeMenu}>{t('nav.home')}</Link>
            <Link className="btn btn-ghost" to="/admin" onClick={closeMenu}>{t('nav.admin')}</Link>
            <a className="btn btn-ghost" href="https://github.com/soaringjerry/Synap" target="_blank" rel="noreferrer" onClick={closeMenu}>{t('nav.github')}</a>
            {authed ? (
              <button className="btn btn-ghost" onClick={()=>{ closeMenu(); logout(setAuthed, navigate) }}>{t('nav.logout')}</button>
            ) : (
              <Link className="btn btn-ghost" to="/auth" onClick={closeMenu}>{t('nav.auth')}</Link>
            )}
            <VersionBadge />
          </div>
          <div className="primary-action">
            <LanguageSwitcher />
          </div>
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
  const { authed, loading } = useServerAuth()
  const loc = useLocation()
  if (loading) return <div style={{padding:24}}>Loading…</div>
  if (!authed) return <Navigate to="/auth" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

const router = createBrowserRouter([
  { element: <RootLayout/>, children: [
    { path: '/', element: <Home/> },
    { path: '/admin', element: <Protected><Admin/></Protected> },
    { path: '/admin/keys', element: <Protected><AdminKeys/></Protected> },
    { path: '/admin/ai', element: <Protected><AdminAI/></Protected> },
    { path: '/admin/scale/:id', element: <Protected><ScaleEditor/></Protected> },
    { path: '/admin/scale/:id/legacy', element: <Protected><AdminScale/></Protected> },
    { path: '/auth', element: <Auth/> },
    { path: '/survey/:scaleId', element: <Survey/> },
    { path: '/legal/privacy', element: <Privacy/> },
    { path: '/legal/terms', element: <Terms/> },
    { path: '/self', element: <SelfManage/> },
  ]}
])

export function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </ToastProvider>
  )
}
