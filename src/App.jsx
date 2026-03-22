// ─── App.jsx mis à jour ───────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { getSession, getStaffProfile } from './lib/supabase'
import LoginPage      from './pages/LoginPage'
import DashboardPage  from './pages/DashboardPage'
import POSPage        from './pages/POSPage'
import CaissePage     from './pages/CaissePage'
import StockPage      from './pages/StockPage'
import { VentesPage } from './pages/StockPage'
import ComptaPage     from './pages/ComptaPage'
import { AdminPage }  from './pages/StockPage'
import ProfilePage    from './pages/ProfilePage'
import AssurancePage  from './pages/AssurancePage'
import Layout         from './components/Layout'
import LivraisonsPage from './pages/LivraisonsPage'

export const AuthContext = React.createContext(null)

export default function App() {
  const [user,    setUser]    = useState(null)
  const [staff,   setStaff]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkSession() }, [])

  async function checkSession() {
    try {
      const session = await getSession()
      if (session?.user) {
        const profile = await getStaffProfile(session.user.id)
        setUser(session.user)
        setStaff(profile)
      }
    } catch (e) { console.log('Session error:', e) }
    setLoading(false)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ textAlign:'center' }}>
        <div className="spinner" style={{ margin:'0 auto 16px' }} />
        <div style={{ color:'var(--t3)', fontSize:14 }}>Chargement ePharma...</div>
      </div>
    </div>
  )

  return (
    <AuthContext.Provider value={{
      user, staff,
      handleLogin:  (u, s) => { setUser(u); setStaff(s) },
      handleLogout: ()     => { setUser(null); setStaff(null) },
    }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage onLogin={(u,s) => { setUser(u); setStaff(s) }} />} />
          {user ? (
            <Route element={<Layout />}>
              <Route path="/"           element={<DashboardPage />} />
              <Route path="/pos"        element={<POSPage />} />
              <Route path="/caisse"     element={<CaissePage />} />
              <Route path="/stock"      element={<StockPage />} />
              <Route path="/ventes"     element={<VentesPage />} />
              <Route path="/compta"     element={<ComptaPage />} />
              <Route path="/assurance"  element={<AssurancePage />} />
              <Route path="/admin"      element={<AdminPage />} />
              <Route path="/profil"     element={<ProfilePage />} />
              <Route path="*"           element={<Navigate to="/" replace />} />
              <Route path="/livraisons" element={<LivraisonsPage />} />
            </Route>
          ) : (
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
