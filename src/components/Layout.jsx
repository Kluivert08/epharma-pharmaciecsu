import React, { useEffect, useState, useRef, useContext } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { AuthContext } from '../App'
import { signOut, supabase } from '../lib/supabase'
import { initStreamClient, disconnectStream, STREAM_API_KEY } from '../lib/getstream'

const ROLE_MENUS = {
  admin:      ['dashboard','pos','caisse','stock','ventes','compta','assurance','livraisons','audit','admin','profil'],
  stock:      ['dashboard','stock','profil'],
  vendeuse:   ['dashboard','pos','livraisons','profil'],
  caissiere:  ['dashboard','caisse','ventes','profil'],
  comptable:  ['dashboard','ventes','compta','assurance','profil'],
}

const MENUS = [
  { id:'dashboard',  label:'Tableau de bord', icon:'📊', path:'/' },
  { id:'pos',        label:'Point de vente',  icon:'🛒', path:'/pos' },
  { id:'caisse',     label:'Caisse',           icon:'💰', path:'/caisse' },
  { id:'stock',      label:'Stock',            icon:'📦', path:'/stock' },
  { id:'ventes',     label:'Ventes',           icon:'📋', path:'/ventes' },
  { id:'compta',     label:'Comptabilité',     icon:'📈', path:'/compta' },
  { id:'assurance',  label:'Assurances',       icon:'🏥', path:'/assurance' },
  { id:'livraisons', label:'Livraisons',       icon:'🚚', path:'/livraisons' },
  { id:'audit',      label:'Audit & Sécurité', icon:'🔒', path:'/audit' },
  { id:'admin',      label:'Administration',   icon:'⚙️',  path:'/admin' },
  { id:'profil',     label:'Mon profil',       icon:'👤',  path:'/profil' },
]

export const ROLE_LABELS = {
  admin:'Administrateur', stock:'Gestion Stock', vendeuse:'Vendeuse', caissiere:'Caissière', comptable:'Comptable',
}
export const ROLE_COLORS = {
  admin:'role-admin', stock:'role-stock', vendeuse:'role-vendeuse', caissiere:'role-caissiere', comptable:'role-comptable',
}

const NOTIFS_INIT = [
  { id:1, icon:'🛒', texte:'Nouvelle commande CMD-0042 en attente', temps:'2 min', lu:false },
  { id:2, icon:'⚠️', texte:'Stock faible : Paracétamol 500mg (3 unités)', temps:'15 min', lu:false },
  { id:3, icon:'✅', texte:'Commande CMD-0041 encaissée', temps:'1h', lu:true },
  { id:4, icon:'🏥', texte:'Créance CNSS — CMD-0038 en attente', temps:'2h', lu:true },
]

// ── Panel Notifications ───────────────────────────────────────
function NotifPanel({ notifs, onMarkAll }) {
  return (
    <div style={{ position:'absolute', top:52, right:0, width:360, background:'var(--card)', borderRadius:14, border:'1px solid var(--border)', boxShadow:'0 8px 32px rgba(26,46,26,.15)', zIndex:300, overflow:'hidden' }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontFamily:'Sora', fontWeight:700, fontSize:15 }}>Notifications</div>
        <button onClick={onMarkAll} style={{ background:'none', border:'none', fontSize:12, color:'var(--g4)', cursor:'pointer', fontWeight:600 }}>Tout marquer lu</button>
      </div>
      <div style={{ maxHeight:380, overflowY:'auto' }}>
        {notifs.map(n => (
          <div key={n.id} style={{ display:'flex', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--border)', background:n.lu?'transparent':'var(--g1)' }}>
            <div style={{ fontSize:22, flexShrink:0 }}>{n.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, color:'var(--t1)', lineHeight:1.4 }}>{n.texte}</div>
              <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>{n.temps}</div>
            </div>
            {!n.lu && <div style={{ width:8, height:8, borderRadius:4, background:'var(--g3)', flexShrink:0, marginTop:4 }} />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Panel Chat GetStream RÉEL ─────────────────────────────────
function ChatPanel({ streamClient, staff }) {
  const [channels,   setChannels]   = useState([])
  const [selected,   setSelected]   = useState(null)
  const [messages,   setMessages]   = useState([])
  const [draft,      setDraft]      = useState('')
  const [unread,     setUnread]     = useState(0)
  const [loading,    setLoading]    = useState(true)
  const messagesEndRef               = useRef(null)
  const channelRef                   = useRef(null)

  useEffect(() => {
    if (streamClient) loadChannels()
    return () => { channelRef.current?.stopWatching() }
  }, [streamClient])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  async function loadChannels() {
    try {
      setLoading(true)
      const filter  = { type:'messaging', members:{ $in:[streamClient.userID] } }
      const sort    = [{ last_message_at:-1 }]
      const chans   = await streamClient.queryChannels(filter, sort, { watch:true, state:true, limit:20 })

      // Compter non lus
      let totalUnread = 0
      chans.forEach(c => { totalUnread += c.countUnread() })
      setUnread(totalUnread)
      setChannels(chans)
      setLoading(false)
    } catch (e) {
      console.log('Stream channels error:', e)
      setLoading(false)
    }
  }

  async function openChannel(channel) {
    try {
      if (channelRef.current) channelRef.current.stopWatching()
      channelRef.current = channel
      await channel.watch()
      await channel.markRead()

      const msgs = channel.state.messages || []
      setMessages(msgs)
      setSelected(channel)

      // Écouter nouveaux messages
      channel.on('message.new', e => {
        setMessages(prev => [...prev, e.message])
      })

      loadChannels() // Refresh unread count
    } catch (e) {
      console.log('Stream channel open error:', e)
    }
  }

  async function sendMessage() {
    if (!draft.trim() || !selected) return
    try {
      await selected.sendMessage({ text: draft })
      setDraft('')
    } catch (e) {
      console.log('Stream send error:', e)
    }
  }

  function getChannelName(channel) {
    // Trouver le nom du client (pas le staff)
    const members = Object.values(channel.state?.members || {})
    const client  = members.find(m => m.user_id !== streamClient.userID)
    return client?.user?.name || channel.data?.name || 'Client'
  }

  function getChannelAvatar(channel) {
    const name = getChannelName(channel)
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  }

  function getLastMessage(channel) {
    const msgs = channel.state?.messages || []
    const last  = msgs[msgs.length - 1]
    if (!last) return 'Aucun message'
    return last.text?.slice(0, 50) || 'Message'
  }

  function formatTime(channel) {
    const last = channel.state?.last_message_at
    if (!last) return ''
    const diff = (Date.now() - new Date(last)) / 60000
    if (diff < 1)  return 'À l\'instant'
    if (diff < 60) return `${Math.floor(diff)} min`
    if (diff < 1440) return `${Math.floor(diff/60)}h`
    return new Date(last).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' })
  }

  return (
    <div style={{ position:'absolute', top:52, right:0, width:400, background:'var(--card)', borderRadius:14, border:'1px solid var(--border)', boxShadow:'0 8px 32px rgba(26,46,26,.15)', zIndex:300, overflow:'hidden', display:'flex', flexDirection:'column', height:520 }}>

      {!selected ? (
        // ── Liste des conversations ──
        <>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontFamily:'Sora', fontWeight:700, fontSize:15 }}>Messages clients</div>
              <div style={{ fontSize:11, color:'var(--g3)', marginTop:2 }}>
                ⚡ GetStream · {STREAM_API_KEY.slice(0, 8)}... · {streamClient?.userID}
              </div>
            </div>
            {unread > 0 && <span className="badge badge-amber">{unread} non lus</span>}
          </div>

          <div style={{ flex:1, overflowY:'auto' }}>
            {loading ? (
              <div style={{ padding:40, textAlign:'center' }}>
                <div className="spinner" style={{ margin:'0 auto 12px' }} />
                <div style={{ fontSize:13, color:'var(--t3)' }}>Connexion GetStream...</div>
              </div>
            ) : channels.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:'var(--t3)' }}>
                <div style={{ fontSize:36, marginBottom:8 }}>💬</div>
                <div style={{ fontSize:13 }}>Aucune conversation pour l'instant</div>
                <div style={{ fontSize:11, marginTop:4 }}>Les messages des clients de l'app apparaissent ici</div>
              </div>
            ) : (
              channels.map(ch => {
                const chanUnread = ch.countUnread()
                return (
                  <div key={ch.id} onClick={() => openChannel(ch)}
                    style={{ display:'flex', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', background:chanUnread>0?'var(--g1)':'transparent', transition:'background .15s' }}
                    onMouseOver={e => e.currentTarget.style.background='var(--g1)'}
                    onMouseOut={e => e.currentTarget.style.background=chanUnread>0?'var(--g1)':'transparent'}>
                    <div style={{ width:42, height:42, borderRadius:12, background:'var(--g3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#fff', flexShrink:0 }}>
                      {getChannelAvatar(ch)}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:13, fontWeight:700, color:'var(--t1)' }}>{getChannelName(ch)}</span>
                        <span style={{ fontSize:11, color:'var(--t3)' }}>{formatTime(ch)}</span>
                      </div>
                      <div style={{ fontSize:12, color:'var(--t2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2 }}>
                        {getLastMessage(ch)}
                      </div>
                    </div>
                    {chanUnread > 0 && (
                      <div style={{ width:20, height:20, borderRadius:10, background:'var(--g3)', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {chanUnread}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      ) : (
        // ── Conversation ouverte ──
        <>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={() => { setSelected(null); channelRef.current?.stopWatching() }}
              style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--g4)', padding:0, lineHeight:1 }}>←</button>
            <div style={{ width:34, height:34, borderRadius:10, background:'var(--g3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff' }}>
              {getChannelAvatar(selected)}
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--t1)' }}>{getChannelName(selected)}</div>
              <div style={{ fontSize:11, color:'var(--g3)' }}>● App PharmacieCSU</div>
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:14, display:'flex', flexDirection:'column', gap:8 }}>
            {messages.map((msg, i) => {
              const isMine = msg.user?.id === streamClient.userID
              return (
                <div key={msg.id || i} style={{ display:'flex', justifyContent:isMine?'flex-end':'flex-start' }}>
                  <div>
                    <div style={{
                      padding:'9px 13px', borderRadius:14,
                      borderBottomRightRadius: isMine ? 4  : 14,
                      borderBottomLeftRadius:  isMine ? 14 : 4,
                      background: isMine ? 'var(--g4)' : 'var(--g1)',
                      color:      isMine ? '#fff' : 'var(--t1)',
                      fontSize:13, maxWidth:260, lineHeight:1.5,
                    }}>
                      {msg.text}
                    </div>
                    <div style={{ fontSize:10, color:'var(--t3)', marginTop:3, textAlign:isMine?'right':'left' }}>
                      {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) : ''}
                      {isMine && msg.status === 'received' && ' ✓✓'}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
            <input
              style={{ flex:1, border:'1.5px solid var(--border)', borderRadius:20, padding:'9px 14px', fontSize:13, outline:'none', fontFamily:'Plus Jakarta Sans', transition:'border-color .15s' }}
              placeholder="Répondre au client..."
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              onFocus={e => e.target.style.borderColor='var(--g3)'}
              onBlur={e => e.target.style.borderColor='var(--border)'}
            />
            <button onClick={sendMessage}
              disabled={!draft.trim()}
              style={{ width:40, height:40, borderRadius:12, background:draft.trim()?'var(--g4)':'var(--g2)', border:'none', color:'#fff', cursor:draft.trim()?'pointer':'default', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center', transition:'background .15s' }}>
              ↑
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Layout principal ──────────────────────────────────────────
export default function Layout() {
  const { staff, handleLogout }         = useContext(AuthContext)
  const navigate                         = useNavigate()
  const location                         = useLocation()
  const role                             = staff?.role ?? 'vendeuse'
  const allowed                          = ROLE_MENUS[role] ?? []
  const visible                          = MENUS.filter(m => allowed.includes(m.id))
  const initiales                        = `${staff?.prenom?.[0]??''}${staff?.nom?.[0]??''}`.toUpperCase() || 'EP'
  const pageTitle                        = MENUS.find(m => m.path === location.pathname)?.label ?? 'ePharma'

  const [notifs,       setNotifs]        = useState(NOTIFS_INIT)
  const [showNotifs,   setShowNotifs]    = useState(false)
  const [showChat,     setShowChat]      = useState(false)
  const [streamClient, setStreamClient]  = useState(null)
  const [chatUnread,   setChatUnread]    = useState(0)

  const notifRef = useRef(null)
  const chatRef  = useRef(null)

  const unreadNotifs = notifs.filter(n => !n.lu).length

  // Init GetStream
  useEffect(() => {
    if (staff && (staff.role === 'vendeuse' || staff.role === 'admin')) {
      initStreamClient(staff).then(client => {
        setStreamClient(client)
        // Compter non lus global
        client.on('notification.message_new', e => {
          setChatUnread(prev => prev + 1)
        })
      }).catch(e => console.log('Stream init error:', e))
    }
    return () => { disconnectStream() }
  }, [staff?.id])

  // Fermer panels au clic extérieur
  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false)
      if (chatRef.current  && !chatRef.current.contains(e.target))  setShowChat(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Notifications Supabase Realtime
  useEffect(() => {
    const channel = supabase.channel('notif_layout')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'commandes_pos' }, p => {
        setNotifs(prev => [{
          id: Date.now(), icon:'🛒',
          texte: `Nouvelle commande ${p.new.numero||''} en attente`,
          temps: "À l'instant", lu: false,
        }, ...prev])
      })
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'livraisons' }, p => {
        setNotifs(prev => [{
          id: Date.now()+1, icon:'🚚',
          texte: `Nouvelle livraison ${p.new.numero||''} créée`,
          temps: "À l'instant", lu: false,
        }, ...prev])
      })
      .subscribe()
    return () => channel.unsubscribe()
  }, [])

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ width:36, height:36, borderRadius:10, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, color:'var(--g4)' }}>✚</div>
          <div>
            <div className="sidebar-logo-text">ePharma</div>
            <div className="sidebar-logo-sub">Pharmacie CSU</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">Navigation</div>
          {visible.filter(m => m.id !== 'profil').map(m => (
            <button key={m.id}
              className={`nav-item ${location.pathname === m.path ? 'active' : ''}`}
              onClick={() => navigate(m.path)}>
              <span className="nav-icon">{m.icon}</span>
              {m.label}
            </button>
          ))}
          <div className="sidebar-section" style={{ marginTop:8 }}>Compte</div>
          <button className={`nav-item ${location.pathname === '/profil' ? 'active' : ''}`}
            onClick={() => navigate('/profil')}>
            <span className="nav-icon">👤</span> Mon profil
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initiales}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="sidebar-user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {staff?.prenom} {staff?.nom}
              </div>
              <div className="sidebar-user-role">{ROLE_LABELS[role]}</div>
            </div>
            <button onClick={async () => { await signOut(); handleLogout() }}
              style={{ background:'none', border:'none', color:'rgba(255,255,255,.5)', cursor:'pointer', fontSize:16, padding:4 }}
              title="Déconnexion">⏻</button>
          </div>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <div className="topbar-title">{pageTitle}</div>
          <div className="topbar-right" style={{ gap:8 }}>
            <span className={`badge ${ROLE_COLORS[role]}`}>{ROLE_LABELS[role]}</span>

            {/* 🔔 Notifications */}
            <div ref={notifRef} style={{ position:'relative' }}>
              <button onClick={() => { setShowNotifs(!showNotifs); setShowChat(false) }}
                style={{ width:38, height:38, borderRadius:10, background:showNotifs?'var(--g1)':'#fff', border:'1.5px solid var(--border)', cursor:'pointer', fontSize:18, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}>
                🔔
                {unreadNotifs > 0 && (
                  <div style={{ position:'absolute', top:-4, right:-4, minWidth:18, height:18, borderRadius:9, background:'var(--danger2)', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>
                    {unreadNotifs}
                  </div>
                )}
              </button>
              {showNotifs && (
                <NotifPanel
                  notifs={notifs}
                  onMarkAll={() => setNotifs(prev => prev.map(n => ({ ...n, lu:true })))}
                />
              )}
            </div>

            {/* 💬 Chat GetStream réel */}
            {(role === 'vendeuse' || role === 'admin') && (
              <div ref={chatRef} style={{ position:'relative' }}>
                <button onClick={() => { setShowChat(!showChat); setShowNotifs(false); if (!showChat) setChatUnread(0) }}
                  style={{ width:38, height:38, borderRadius:10, background:showChat?'var(--g1)':'#fff', border:'1.5px solid var(--border)', cursor:'pointer', fontSize:18, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .15s' }}>
                  💬
                  {chatUnread > 0 && (
                    <div style={{ position:'absolute', top:-4, right:-4, minWidth:18, height:18, borderRadius:9, background:'var(--g3)', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>
                      {chatUnread}
                    </div>
                  )}
                </button>
                {showChat && streamClient && (
                  <ChatPanel streamClient={streamClient} staff={staff} />
                )}
                {showChat && !streamClient && (
                  <div style={{ position:'absolute', top:52, right:0, width:300, background:'var(--card)', borderRadius:14, border:'1px solid var(--border)', padding:24, textAlign:'center', color:'var(--t3)', fontSize:13 }}>
                    <div className="spinner" style={{ margin:'0 auto 12px' }} />
                    Connexion à GetStream...
                  </div>
                )}
              </div>
            )}

            {/* Avatar */}
            <div style={{ width:38, height:38, borderRadius:10, background:'var(--g4)', border:'1.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, color:'#fff', cursor:'pointer' }}
              onClick={() => navigate('/profil')}>
              {initiales}
            </div>
          </div>
        </header>

        <main className="page-body">
          <Outlet />
        </main>
      </div>
    </div>
  )

  //Log de déconnexion
  async function logout() {
  if (staff) {
    await supabase.from('audit_logs').insert({
      staff_id: staff.id, action: 'logout',
      details: `${staff.prenom} ${staff.nom}`, statut: 'success',
    })
  }
  await signOut()
  handleLogout()
}
}