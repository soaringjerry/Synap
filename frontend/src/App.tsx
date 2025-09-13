import { createBrowserRouter, RouterProvider, Link, Outlet, useLocation, Navigate } from 'react-router-dom'
import { VersionBadge } from './components/VersionBadge'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { Home } from './pages/Home'
import { CookieBanner } from './components/CookieBanner'
import { Privacy } from './pages/Privacy'
import { Admin } from './pages/Admin'
import { Auth } from './pages/Auth'
import { Survey } from './pages/Survey'

function RootLayout() {
  return (
    <>
      <header className="app-header">
        <div className="brand">Synap</div>
        <div className="nav-actions">
          <Link className="btn btn-ghost" to="/">Home</Link>
          <Link className="btn btn-ghost" to="/admin">Admin</Link>
          <Link className="btn btn-primary" to="/auth">Auth</Link>
          <button className="btn btn-ghost" onClick={()=> (window as any).openCookiePrefs?.() }>Cookies</button>
          <LanguageSwitcher />
          <VersionBadge />
        </div>
      </header>
      <main className="page">
        <div className="container">
          <Outlet />
        </div>
      </main>
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
  ]}
])

export function App() {
  return (
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  )
}
