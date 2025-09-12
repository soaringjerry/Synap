import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { Home } from './pages/Home'
import { Admin } from './pages/Admin'
import { Auth } from './pages/Auth'

export function App() {
  return (
    <BrowserRouter>
      <VersionBadge />
      <nav style={{ position:'fixed', left:12, top:10, display:'flex', gap:10 }}>
        <Link className="neon-btn" to="/">Home</Link>
        <Link className="neon-btn" to="/admin">Admin</Link>
        <Link className="neon-btn" to="/auth">Auth</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home/>} />
        <Route path="/admin" element={<Admin/>} />
        <Route path="/auth" element={<Auth/>} />
      </Routes>
    </BrowserRouter>
  )
}
