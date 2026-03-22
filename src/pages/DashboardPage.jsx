import React, { useEffect, useState, useContext } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { AuthContext } from '../App'
import { getDashboard, getVentesParJour, getStockAlertes, supabase } from '../lib/supabase'

const COLORS = {
  green:  '#4CAF50',
  green2: '#2E7D32',
  green3: '#A5D6A7',
  amber:  '#F9A825',
  red:    '#C62828',
  blue:   '#1565C0',
  orange: '#E65100',
  gray:   '#7A9E7A',
}

const PAIEMENT_COLORS = {
  mtn_momo:     '#F9A825',
  airtel_money: '#C62828',
  visa:         '#1565C0',
  especes:      '#4CAF50',
}

const PAIEMENT_LABELS = {
  mtn_momo:     'MTN MoMo',
  airtel_money: 'Airtel Money',
  visa:         'Carte Visa',
  especes:      'Espèces',
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#fff', border:'1px solid #C8E6C0', borderRadius:10, padding:'10px 14px', fontSize:13, boxShadow:'0 4px 16px rgba(26,46,26,.12)' }}>
      <div style={{ fontWeight:700, color:'#1A2E1A', marginBottom:6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:8, height:8, borderRadius:4, background:p.color }} />
          <span style={{ color:'#3D5C3D' }}>{p.name} : </span>
          <strong>{typeof p.value === 'number' ? p.value.toLocaleString('fr-FR') : p.value} {p.unit || ''}</strong>
        </div>
      ))}
    </div>
  )
}

function StatCard({ icon, label, value, sub, color, delay = 0 }) {
  return (
    <div className="stat-card fade-in" style={{ animationDelay:`${delay}s` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div className="stat-label">{label}</div>
        <span style={{ fontSize:26 }}>{icon}</span>
      </div>
      <div className="stat-value" style={{ color: color || 'var(--t1)' }}>{value}</div>
      {sub && <div className="stat-sub" style={{ marginTop:4 }}>{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const { staff }                       = useContext(AuthContext)
  const [dash,          setDash]        = useState(null)
  const [ventesJour,    setVentesJour]  = useState([])
  const [ventesSemaine, setVentesSem]   = useState([])
  const [alertes,       setAlertes]     = useState([])
  const [payStats,      setPayStats]    = useState([])
  const [topProduits,   setTopProduits] = useState([])
  const [top5Tri,       setTop5Tri]     = useState('qte')   // qte | ca
  const [loading,       setLoading]     = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [d, vj, a] = await Promise.all([
      getDashboard(), getVentesParJour(30), getStockAlertes(),
    ])

    // ── Paiements du mois ──
    const { data: payData } = await supabase
      .from('ventes')
      .select('mode_paiement, total')
      .eq('statut', 'payee')
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())

    // ── Top produits — lire depuis commandes_pos_lignes (source principale) ──
    const { data: topData } = await supabase
      .from('commandes_pos_lignes')
      .select(`
        quantite, prix_unitaire, total_ligne,
        produits(id, nom, emoji),
        commandes_pos!inner(statut)
      `)
      .eq('commandes_pos.statut', 'payee')

    // Agréger par produit
    const prodMap = {}
    topData?.forEach(l => {
      if (!l.produits?.id) return
      const id = l.produits.id
      if (!prodMap[id]) {
        prodMap[id] = { nom: l.produits.nom, emoji: l.produits.emoji, qte: 0, ca: 0 }
      }
      prodMap[id].qte += l.quantite
      prodMap[id].ca  += l.total_ligne
    })
    const top5 = Object.values(prodMap)
      .sort((a, b) => b.qte - a.qte)
      .slice(0, 5)

    // ── CA par jour (14 derniers jours) ──
    const dayMap = {}
    vj?.forEach(v => {
      const day = new Date(v.created_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' })
      dayMap[day] = (dayMap[day] || 0) + v.total
    })
    const ventesData = Object.entries(dayMap).map(([date, total]) => ({ date, total })).slice(-14)

    // ── CA par jour de semaine ──
    const joursSem = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']
    const semMap   = Object.fromEntries(joursSem.map(j => [j, 0]))
    vj?.forEach(v => {
      const j     = new Date(v.created_at).getDay()
      const label = joursSem[j === 0 ? 6 : j - 1]
      semMap[label] = (semMap[label] || 0) + v.total
    })
    const semData = joursSem.map(j => ({ jour:j, total:semMap[j] }))

    // ── Répartition paiements ──
    const pMap = {}
    payData?.forEach(p => {
      pMap[p.mode_paiement] = (pMap[p.mode_paiement] || 0) + p.total
    })
    const pStats = Object.entries(pMap).map(([name, value]) => ({
      name:  PAIEMENT_LABELS[name] || name,
      value,
      color: PAIEMENT_COLORS[name] || COLORS.gray,
    }))

    setDash(d)
    setVentesJour(ventesData)
    setVentesSem(semData)
    setAlertes(a)
    setPayStats(pStats)
    setTopProduits(top5)
    setLoading(false)
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>

  const heure = new Date().getHours()
  const salut = heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir'

  // Top 5 trié selon le mode choisi
  const top5Sorted = [...topProduits].sort((a, b) => b[top5Tri] - a[top5Tri])

  return (
    <div className="fade-in">
      {/* Salutation */}
      <div style={{ marginBottom:24 }}>
        <h2 style={{ marginBottom:4 }}>{salut}, {staff?.prenom} 👋</h2>
        <div style={{ color:'var(--t3)', fontSize:14 }}>
          {new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid-4" style={{ marginBottom:24 }}>
        <StatCard icon="💰" label="CA aujourd'hui"
          value={`${(dash?.ca_jour??0).toLocaleString('fr-FR')} F`}
          sub={`${dash?.ventes_jour??0} vente${dash?.ventes_jour>1?'s':''}`}
          color={COLORS.green2} delay={0} />
        <StatCard icon="📅" label="CA ce mois"
          value={`${(dash?.ca_mois??0).toLocaleString('fr-FR')} F`}
          sub={`${dash?.ventes_mois??0} ventes`}
          color={COLORS.green2} delay={0.05} />
        <StatCard icon="📦" label="Produits en stock"
          value={dash?.total_produits??0}
          sub={dash?.produits_rupture>0 ? `⚠️ ${dash.produits_rupture} en alerte` : '✅ Tous OK'}
          color={dash?.produits_rupture>0 ? COLORS.red : COLORS.green2} delay={0.1} />
        <StatCard icon="👥" label="Équipe active"
          value={dash?.total_staff??0}
          sub="Membres du staff"
          color={COLORS.green2} delay={0.15} />
      </div>

      {/* Graphiques ligne 1 */}
      <div className="grid-2" style={{ marginBottom:24 }}>
        {/* CA 14 jours */}
        <div className="card fade-in stagger-1">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <h4>Évolution CA · 14 derniers jours</h4>
            <span className="badge badge-green">FCFA</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={ventesJour} margin={{ top:5, right:10, left:0, bottom:5 }}>
              <defs>
                <linearGradient id="caGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLORS.green} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.green} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8F0E8" />
              <XAxis dataKey="date" tick={{ fontSize:11, fill:COLORS.gray }} />
              <YAxis tick={{ fontSize:11, fill:COLORS.gray }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="total" name="CA" unit=" F"
                stroke={COLORS.green2} strokeWidth={2.5}
                fill="url(#caGradient)" dot={{ fill:COLORS.green2, r:3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Paiements donut */}
        <div className="card fade-in stagger-2">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <h4>Paiements · Ce mois</h4>
            <span className="badge badge-green">Répartition</span>
          </div>
          {payStats.length === 0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--t3)', fontSize:13 }}>Aucune vente ce mois</div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie data={payStats} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {payStats.map((p, i) => <Cell key={i} fill={p.color} />)}
                  </Pie>
                  <Tooltip formatter={v => [`${v.toLocaleString('fr-FR')} F`]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex:1 }}>
                {payStats.map((p, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <div style={{ width:10, height:10, borderRadius:5, background:p.color, flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'var(--t1)' }}>{p.name}</div>
                      <div style={{ fontSize:11, color:'var(--t3)' }}>{p.value.toLocaleString('fr-FR')} F</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Graphiques ligne 2 */}
      <div className="grid-2" style={{ marginBottom:24 }}>
        {/* Activité par jour semaine */}
        <div className="card fade-in stagger-3">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <h4>Activité par jour de semaine</h4>
            <span className="badge badge-green">30 jours</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ventesSemaine} margin={{ top:5, right:10, left:0, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8F0E8" />
              <XAxis dataKey="jour" tick={{ fontSize:12, fill:COLORS.gray }} />
              <YAxis tick={{ fontSize:11, fill:COLORS.gray }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="CA" unit=" F" radius={[6,6,0,0]}>
                {ventesSemaine.map((e, i) => (
                  <Cell key={i} fill={e.total === Math.max(...ventesSemaine.map(d => d.total)) ? COLORS.green2 : COLORS.green3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top 5 produits — triable */}
        <div className="card fade-in stagger-4">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <h4>Top 5 produits</h4>
            <div style={{ display:'flex', gap:6 }}>
              <button
                className={`btn btn-sm ${top5Tri==='qte'?'btn-primary':'btn-outline'}`}
                onClick={() => setTop5Tri('qte')}>
                📦 Quantité
              </button>
              <button
                className={`btn btn-sm ${top5Tri==='ca'?'btn-primary':'btn-outline'}`}
                onClick={() => setTop5Tri('ca')}>
                💰 CA
              </button>
            </div>
          </div>
          {top5Sorted.length === 0 ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--t3)', fontSize:13 }}>
              Aucune vente enregistrée
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {top5Sorted.map((p, i) => {
                const maxVal = top5Sorted[0][top5Tri]
                const pct    = maxVal > 0 ? (p[top5Tri] / maxVal) * 100 : 0
                return (
                  <div key={p.nom} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:22, height:22, borderRadius:6, background:'var(--g1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--g4)', flexShrink:0 }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize:18, flexShrink:0 }}>{p.emoji}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--t1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {p.nom}
                        </span>
                        <span style={{ fontSize:12, fontWeight:700, color:'var(--g4)', flexShrink:0, marginLeft:8 }}>
                          {top5Tri === 'qte'
                            ? `${p.qte} u.`
                            : `${p.ca.toLocaleString('fr-FR')} F`}
                        </span>
                      </div>
                      <div style={{ height:5, background:'var(--g1)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:i===0?COLORS.green2:COLORS.green, borderRadius:3, transition:'width .4s ease' }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Alertes + Activité récente */}
      <div className="grid-2">
        <div className="card fade-in">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <h4>Alertes stock</h4>
            {alertes.length > 0 && <span className="badge badge-red">{alertes.length}</span>}
          </div>
          {alertes.length === 0 ? (
            <div style={{ color:'var(--t3)', fontSize:13, padding:'20px 0', textAlign:'center' }}>✅ Tous les stocks sont OK</div>
          ) : alertes.slice(0, 6).map(a => (
            <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', marginBottom:6, background:a.niveau==='rupture'?'var(--danger)':a.niveau==='critique'?'#FFF3E0':'var(--warn1)', borderRadius:8 }}>
              <span style={{ fontSize:18 }}>{a.emoji}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{a.nom}</div>
                <div style={{ fontSize:11, color:'var(--t3)' }}>{a.categorie}</div>
              </div>
              <span className={`badge ${a.niveau==='rupture'||a.niveau==='critique'?'badge-red':'badge-amber'}`}>{a.stock} u.</span>
            </div>
          ))}
        </div>

        <div className="card fade-in stagger-1">
          <h4 style={{ marginBottom:14 }}>Activité récente</h4>
          <RecentActivity />
        </div>
      </div>
    </div>
  )
}

function RecentActivity() {
  const [events, setEvents] = useState([])

  useEffect(() => {
    loadEvents()
    const channel = supabase.channel('recent_dash')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'ventes' }, p => {
        setEvents(prev => [{
          id: Date.now(), icon:'💰',
          texte: `Vente ${p.new.total?.toLocaleString('fr-FR')} FCFA`,
          temps: "À l'instant",
        }, ...prev.slice(0, 9)])
      })
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'commandes_pos' }, p => {
        setEvents(prev => [{
          id: Date.now()+1, icon:'🛒',
          texte: `Commande ${p.new.numero||''} en attente`,
          temps: "À l'instant",
        }, ...prev.slice(0, 9)])
      })
      .subscribe()
    return () => channel.unsubscribe()
  }, [])

  async function loadEvents() {
    const { data } = await supabase
      .from('ventes')
      .select('id, total, created_at, staff:staff_id(prenom)')
      .order('created_at', { ascending:false })
      .limit(8)
    setEvents((data??[]).map(v => ({
      id:    v.id,
      icon:  '💰',
      texte: `Vente ${v.total?.toLocaleString('fr-FR')} F · ${v.staff?.prenom||''}`,
      temps: new Date(v.created_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }),
    })))
  }

  if (!events.length) return <div style={{ color:'var(--t3)', fontSize:13, padding:'20px 0', textAlign:'center' }}>Aucune activité récente</div>

  return (
    <div>
      {events.map((e, i) => (
        <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:i<events.length-1?'1px solid var(--border)':'none' }}>
          <div style={{ width:32, height:32, borderRadius:10, background:'var(--g1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>{e.icon}</div>
          <div style={{ flex:1, fontSize:13, color:'var(--t1)', fontWeight:500 }}>{e.texte}</div>
          <div style={{ fontSize:11, color:'var(--t3)', whiteSpace:'nowrap' }}>{e.temps}</div>
        </div>
      ))}
    </div>
  )
}