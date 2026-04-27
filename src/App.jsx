// ─── App.jsx v2 ───────────────────────────────────────────────
import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { getSession, getStaffProfile, logAudit } from './lib/supabase'

import LoginPage         from './pages/LoginPage'
import DashboardPage     from './pages/DashboardPage'
import POSPage           from './pages/POSPage'
import AchatsEnLignePage from './pages/AchatsEnLignePage'
import CaissePage        from './pages/CaissePage'
import StockPage         from './pages/StockPage'
import VentesPage        from './pages/VentesPage'
import ComptaPage        from './pages/ComptaPage'
import AdminPage         from './pages/AdminPage'
import ProfilePage       from './pages/ProfilePage'
import AssurancePage     from './pages/AssurancePage'
import LivraisonsPage    from './pages/LivraisonsPage'
import AuditPage         from './pages/AuditPage'
import MagasinierPage    from './pages/MagasinierPage'
import AvoirsPage        from './pages/AvoirsPage'
import BonsCommandePage  from './pages/BonsCommandePage'
import FournisseursPage  from './pages/FournisseursPage'
import GestionSeuilPage  from './pages/GestionSeuilPage'
import Layout            from './components/Layout'

export const AuthContext = React.createContext(null)

// Rôles disponibles
// superadmin | admin | comptable | stock | magasinier | vendeuse | caissiere

// Routes autorisées par rôle
const ROLE_ROUTES = {
  superadmin:  ['/', '/pos', '/achats-en-ligne', '/caisse', '/stock', '/magasinier',
                 '/ventes', '/compta', '/assurance', '/livraisons', '/audit',
                 '/admin', '/avoirs', '/bons-commande', '/fournisseurs', '/seuil', '/profil'],
  admin:       ['/', '/pos', '/achats-en-ligne', '/caisse', '/stock', '/magasinier',
                 '/ventes', '/compta', '/assurance', '/livraisons', '/audit',
                 '/admin', '/avoirs', '/bons-commande', '/fournisseurs', '/seuil', '/profil'],
  comptable:   ['/', '/ventes', '/compta', '/assurance', '/fournisseurs', '/seuil', '/profil'],
  stock:       ['/', '/stock', '/bons-commande', '/magasinier', '/fournisseurs', '/profil'],
  magasinier:  ['/', '/magasinier', '/profil'],
  vendeuse:    ['/', '/pos', '/achats-en-ligne', '/avoirs', '/livraisons', '/profil'],
  caissiere:   ['/', '/caisse', '/ventes', '/profil'],
}

function canAccess(role, path) {
  const allowed = ROLE_ROUTES[role] ?? []
  return allowed.includes(path)
}

function ProtectedRoute({ role, path, children }) {
  if (!canAccess(role, path)) return <Navigate to="/" replace />
  return children
}

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

  async function handleLogin(u, s) {
    setUser(u)
    setStaff(s)
    await logAudit({
      staffId:   s.id,
      action:    'login',
      details:   `${s.prenom} ${s.nom} — ${s.role}`,
      statut:    'success',
      userAgent: navigator.userAgent,
    })
  }

  async function handleLogout() {
    if (staff) {
      await logAudit({
        staffId: staff.id,
        action:  'logout',
        details: `${staff.prenom} ${staff.nom}`,
        statut:  'success',
      })
    }
    setUser(null)
    setStaff(null)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ textAlign:'center' }}>
        <div className="spinner" style={{ margin:'0 auto 16px' }} />
        <div style={{ color:'var(--t3)', fontSize:14 }}>Chargement ePharma...</div>
      </div>
    </div>
  )

  const role = staff?.role ?? ''

  return (
    <AuthContext.Provider value={{ user, staff, handleLogin, handleLogout }}>
      <BrowserRouter>
        <Routes>

          {/* Login */}
          <Route path="/login"
            element={user ? <Navigate to="/" replace /> : <LoginPage onLogin={handleLogin} />}
          />

          {/* App */}
          {user ? (
            <Route element={<Layout />}>

              {/* Dashboard — tous les rôles */}
              <Route path="/" element={<DashboardPage />} />

              {/* Vendeuse */}
              <Route path="/pos"
                element={<ProtectedRoute role={role} path="/pos"><POSPage /></ProtectedRoute>}
              />
              <Route path="/achats-en-ligne"
                element={<ProtectedRoute role={role} path="/achats-en-ligne"><AchatsEnLignePage /></ProtectedRoute>}
              />
              <Route path="/avoirs"
                element={<ProtectedRoute role={role} path="/avoirs"><AvoirsPage /></ProtectedRoute>}
              />

              {/* Caissière */}
              <Route path="/caisse"
                element={<ProtectedRoute role={role} path="/caisse"><CaissePage /></ProtectedRoute>}
              />

              {/* Ventes */}
              <Route path="/ventes"
                element={<ProtectedRoute role={role} path="/ventes"><VentesPage /></ProtectedRoute>}
              />

              {/* Stock (gestionnaire de stock) */}
              <Route path="/stock"
                element={<ProtectedRoute role={role} path="/stock"><StockPage /></ProtectedRoute>}
              />
              <Route path="/bons-commande"
                element={<ProtectedRoute role={role} path="/bons-commande"><BonsCommandePage /></ProtectedRoute>}
              />

              {/* Magasinier */}
              <Route path="/magasinier"
                element={<ProtectedRoute role={role} path="/magasinier"><MagasinierPage /></ProtectedRoute>}
              />

              {/* Comptabilité */}
              <Route path="/compta"
                element={<ProtectedRoute role={role} path="/compta"><ComptaPage /></ProtectedRoute>}
              />
              <Route path="/fournisseurs"
                element={<ProtectedRoute role={role} path="/fournisseurs"><FournisseursPage /></ProtectedRoute>}
              />
              <Route path="/seuil"
                element={<ProtectedRoute role={role} path="/seuil"><GestionSeuilPage /></ProtectedRoute>}
              />

              {/* Assurance */}
              <Route path="/assurance"
                element={<ProtectedRoute role={role} path="/assurance"><AssurancePage /></ProtectedRoute>}
              />

              {/* Livraisons */}
              <Route path="/livraisons"
                element={<ProtectedRoute role={role} path="/livraisons"><LivraisonsPage /></ProtectedRoute>}
              />

              {/* Audit — superadmin + admin */}
              <Route path="/audit"
                element={<ProtectedRoute role={role} path="/audit"><AuditPage /></ProtectedRoute>}
              />

              {/* Admin */}
              <Route path="/admin"
                element={<ProtectedRoute role={role} path="/admin"><AdminPage /></ProtectedRoute>}
              />

              {/* Profil — tous */}
              <Route path="/profil" element={<ProfilePage />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />

            </Route>
          ) : (
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}

        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}