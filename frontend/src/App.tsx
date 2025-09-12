import { createBrowserRouter, RouterProvider, Link, Outlet } from 'react-router-dom'
import { VersionBadge } from './components/VersionBadge'
import { Home } from './pages/Home'
import { Admin } from './pages/Admin'
import { Auth } from './pages/Auth'

function RootLayout() {
  return (
    <>
      <VersionBadge />
      <nav style={{ position:'fixed', left:12, top:10, display:'flex', gap:10 }}>
        <Link className="neon-btn" to="/">Home</Link>
        <Link className="neon-btn" to="/admin">Admin</Link>
        <Link className="neon-btn" to="/auth">Auth</Link>
      </nav>
      <Outlet />
    </>
  )
}

const router = createBrowserRouter([
  { element: <RootLayout/>, children: [
    { path: '/', element: <Home/> },
    { path: '/admin', element: <Admin/> },
    { path: '/auth', element: <Auth/> },
  ]}
])

export function App() {
  return (
    <RouterProvider router={router} future={{ v7_startTransition: true, v7_relativeSplatPath: true }} />
  )
}
