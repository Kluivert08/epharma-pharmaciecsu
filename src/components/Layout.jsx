import React, { useContext, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { AuthContext } from '../App'
import { signOut } from '../lib/supabase'

const NAV_SECTIONS = [
  {
    section: 'Principal',
    items: [
      { path: '/',          label: 'Tableau de bord', icon: '📊', roles: ['superadmin','admin','comptable','stock','magasinier','vendeuse','caissiere'] },
    ],
  },
  {
    section: 'Vente',
    items: [
      { path: '/pos',             label: 'Point de vente',   icon: '🛒', roles: ['superadmin','admin','vendeuse'] },
      { path: '/achats-en-ligne', label: 'Achats en ligne',  icon: '🌐', roles: ['superadmin','admin','vendeuse'] },
      { path: '/avoirs',          label: 'Avoirs / Retours', icon: '↩️',  roles: ['superadmin','admin','vendeuse'] },
      { path: '/caisse',          label: 'Caisse',           icon: '💰', roles: ['superadmin','admin','caissiere'] },
      { path: '/livraisons',      label: 'Livraisons',       icon: '🚚', roles: ['superadmin','admin','vendeuse'] },
    ],
  },
  {
    section: 'Magasin',
    items: [
      { path: '/stock',          label: 'Gestion Stock',    icon: '📦', roles: ['superadmin','admin','stock'] },
      { path: '/magasinier',     label: 'Magasinier',       icon: '🏭', roles: ['superadmin','admin','stock','magasinier'] },
      { path: '/bons-commande',  label: 'Bons de commande', icon: '📋', roles: ['superadmin','admin','stock'] },
    ],
  },
  {
    section: 'Comptabilité & Finance',
    items: [
      { path: '/ventes',       label: 'Ventes',          icon: '📈', roles: ['superadmin','admin','comptable','caissiere'] },
      { path: '/compta',       label: 'Comptabilité',    icon: '🧾', roles: ['superadmin','admin','comptable'] },
      { path: '/assurance',    label: 'Assurances',      icon: '🏥', roles: ['superadmin','admin','comptable'] },
      { path: '/fournisseurs', label: 'Fournisseurs',    icon: '🏢', roles: ['superadmin','admin','comptable'] },
      { path: '/seuil',        label: 'Gestion Seuil',   icon: '🎯', roles: ['superadmin','admin','comptable'] },
    ],
  },
  {
    section: 'Audit & Sécurité',
    items: [
      { path: '/audit', label: "Journal d'activité", icon: '🔍', roles: ['superadmin','admin'] },
    ],
  },
  {
    section: 'Administration',
    items: [
      { path: '/admin', label: 'Staff & Accès', icon: '👥', roles: ['superadmin','admin'] },
    ],
  },
]

const ROLE_LABELS = {
  superadmin: 'Super Admin',
  admin:      'Administrateur',
  comptable:  'Comptable',
  stock:      'Gestionnaire Stock',
  magasinier: 'Magasinier',
  vendeuse:   'Vendeuse',
  caissiere:  'Caissière',
}

export default function Layout() {
  const { staff, handleLogout } = useContext(AuthContext)
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const role = staff?.role ?? ''

  async function handleSignOut() {
    await signOut()
    handleLogout()
    navigate('/login')
  }

  const initiales = `${staff?.prenom?.[0] || ''}${staff?.nom?.[0] || ''}`.toUpperCase()

  function canSee(item) {
    return item.roles.includes(role)
  }

  // Couleurs sidebar — même dégradé vert que le login
  const SB = {
    bg:         'linear-gradient(180deg, var(--g5) 0%, var(--g4) 100%)',
    text:       'rgba(255,255,255,.80)',
    textActive: '#ffffff',
    bgActive:   'rgba(255,255,255,.18)',
    bgHover:    'rgba(255,255,255,.10)',
    section:    'rgba(255,255,255,.38)',
    border:     'rgba(255,255,255,.12)',
    logo:       'rgba(255,255,255,.15)',
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width:          sidebarOpen ? 240 : 64,
        minHeight:      '100vh',
        background:     SB.bg,
        display:        'flex',
        flexDirection:  'column',
        transition:     'width .2s ease',
        flexShrink:     0,
        position:       'sticky',
        top:            0,
        height:         '100vh',
        overflowY:      'auto',
        overflowX:      'hidden',
      }}>

        {/* Logo + toggle */}
        <div style={{ padding:'18px 14px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${SB.border}` }}>
          {sidebarOpen ? (
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:10, background:SB.logo, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:18, flexShrink:0 }}>✚</div>
              <div>
                <div style={{ fontFamily:'Sora', fontWeight:800, fontSize:14, color:'#fff', lineHeight:1.1 }}>ePharma</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,.55)' }}>Pharmacie CSU</div>
              </div>
            </div>
          ) : (
            <div style={{ width:34, height:34, borderRadius:10, background:SB.logo, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:18, margin:'0 auto' }}>✚</div>
          )}

        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
          {NAV_SECTIONS.map(sec => {
            const visibleItems = sec.items.filter(canSee)
            if (visibleItems.length === 0) return null
            return (
              <div key={sec.section} style={{ marginBottom:4 }}>
                {sidebarOpen && (
                  <div style={{ fontSize:10, fontWeight:700, color:SB.section, textTransform:'uppercase', letterSpacing:'.08em', padding:'10px 8px 4px' }}>
                    {sec.section}
                  </div>
                )}
                {visibleItems.map(item => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    style={({ isActive }) => ({
                      display:        'flex',
                      alignItems:     'center',
                      gap:            10,
                      padding:        '9px 10px',
                      borderRadius:   9,
                      marginBottom:   2,
                      textDecoration: 'none',
                      fontFamily:     'Plus Jakarta Sans',
                      fontSize:       13,
                      fontWeight:     isActive ? 700 : 500,
                      color:          isActive ? SB.textActive : SB.text,
                      background:     isActive ? SB.bgActive : 'transparent',
                      transition:     'all .12s',
                    })}
                    onMouseEnter={e => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = SB.bgHover }}
                    onMouseLeave={e => { if (!e.currentTarget.classList.contains('active')) e.currentTarget.style.background = 'transparent' }}
                    title={!sidebarOpen ? item.label : undefined}
                  >
                    <span style={{ fontSize:16, flexShrink:0 }}>{item.icon}</span>
                    {sidebarOpen && <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</span>}
                  </NavLink>
                ))}
                {sidebarOpen && <div style={{ height:1, background:SB.border, margin:'4px 8px' }} />}
              </div>
            )
          })}
        </nav>

        {/* Profil + logout */}
        <div style={{ borderTop:`1px solid ${SB.border}`, padding:'10px 8px' }}>
          <NavLink to="/profil" style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:9, textDecoration:'none', marginBottom:4 }}>
            <div style={{ width:32, height:32, borderRadius:9, background:'rgba(255,255,255,.2)', border:'1.5px solid rgba(255,255,255,.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
              {initiales}
            </div>
            {sidebarOpen && (
              <div style={{ overflow:'hidden' }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {staff?.prenom} {staff?.nom}
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.55)' }}>{ROLE_LABELS[role] || role}</div>
              </div>
            )}
          </NavLink>
          <button
            onClick={handleSignOut}
            style={{
              width:'100%', display:'flex', alignItems:'center', gap:10,
              padding:'7px 10px', borderRadius:9, border:'none',
              background:'rgba(255,255,255,.08)',
              cursor:'pointer', color:'rgba(255,255,255,.75)', fontSize:13, fontWeight:500,
            }}
            title={!sidebarOpen ? 'Se déconnecter' : undefined}
          >
            <span style={{ fontSize:16, flexShrink:0 }}>⏻</span>
            {sidebarOpen && <span>Se déconnecter</span>}
          </button>
        </div>
      </aside>

      {/* ── CONTENU ── */}
      <main style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

        {/* Topbar */}
        <div style={{ height:54, borderBottom:'1px solid var(--border)', background:'var(--card)', display:'flex', alignItems:'center', padding:'0 24px', gap:12, position:'sticky', top:0, zIndex:100 }}>
          <div style={{ flex:1 }} />
          <div style={{ fontSize:12, color:'var(--t3)' }}>
            {new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </div>
          <div style={{ width:1, height:20, background:'var(--border)' }} />
          <NavLink to="/profil" style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none', padding:'4px 8px', borderRadius:8 }}>
            <div style={{ width:28, height:28, borderRadius:8, background:'var(--g4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff' }}>
              {initiales}
            </div>
            <div style={{ fontSize:12 }}>
              <div style={{ fontWeight:600, color:'var(--t1)' }}>{staff?.prenom} {staff?.nom}</div>
              <div style={{ color:'var(--t3)', fontSize:11 }}>{ROLE_LABELS[role]}</div>
            </div>
          </NavLink>
        </div>

        {/* Page */}
        <div style={{ flex:1, padding:24, overflowY:'auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}