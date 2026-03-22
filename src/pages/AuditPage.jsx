import React, { useEffect, useState, useContext } from 'react'
import { AuthContext } from '../App'
import { supabase } from '../lib/supabase'

// ── API ───────────────────────────────────────────────────────
async function getAuditLogs({ action, statut, staffId, debut, fin, limit = 100 }) {
  let q = supabase
    .from('audit_logs')
    .select(`
      id, action, table_name, record_id,
      old_data, new_data, statut, details,
      created_at, ip_address,
      staff:staff_id ( nom, prenom, role )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (action)  q = q.eq('action', action)
  if (statut)  q = q.eq('statut', statut)
  if (staffId) q = q.eq('staff_id', staffId)
  if (debut)   q = q.gte('created_at', `${debut}T00:00:00`)
  if (fin)     q = q.lte('created_at', `${fin}T23:59:59`)

  const { data } = await q
  return data ?? []
}

async function getAuditResume() {
  const { data } = await supabase.from('v_audit_resume').select('*').limit(30)
  return data ?? []
}

async function getStaffList() {
  const { data } = await supabase.from('staff').select('id, nom, prenom, role').order('nom')
  return data ?? []
}

// ── Helpers ───────────────────────────────────────────────────
const ACTION_LABELS = {
  commande_creee:       { label:'Commande créée',      icon:'🛒', color:'var(--g4)' },
  commande_encaissee:   { label:'Commande encaissée',  icon:'💰', color:'var(--g4)' },
  commande_annulee:     { label:'Commande annulée',    icon:'❌', color:'#E65100' },
  stock_modifie:        { label:'Stock modifié',       icon:'📦', color:'#F9A825' },
  prix_modifie:         { label:'Prix modifié',        icon:'💲', color:'#F9A825' },
  produit_cree:         { label:'Produit créé',        icon:'➕', color:'var(--g4)' },
  produit_modifie:      { label:'Produit modifié',     icon:'✏️',  color:'#F9A825' },
  produit_desactive:    { label:'Produit désactivé',   icon:'⛔', color:'#C62828' },
  produit_active:       { label:'Produit activé',      icon:'✅', color:'var(--g4)' },
  staff_cree:           { label:'Staff créé',          icon:'👤', color:'var(--g4)' },
  staff_active:         { label:'Staff activé',        icon:'✅', color:'var(--g4)' },
  staff_desactive:      { label:'Staff désactivé',     icon:'🚫', color:'#C62828' },
  role_modifie:         { label:'Rôle modifié',        icon:'🔄', color:'#E65100' },
  assurance_activee:    { label:'Assurance activée',   icon:'🏥', color:'var(--g4)' },
  assurance_desactivee: { label:'Assurance désactivée',icon:'🏥', color:'#C62828' },
  login:                { label:'Connexion',           icon:'🔐', color:'var(--g4)' },
  logout:               { label:'Déconnexion',         icon:'⏻',  color:'var(--t3)' },
}

const STATUT_CONFIG = {
  success: { label:'Succès',      bg:'var(--g1)',     color:'var(--g4)' },
  warning: { label:'Avertissement',bg:'var(--warn)',  color:'var(--warn2)' },
  failure: { label:'Échec',       bg:'var(--danger)', color:'var(--danger2)' },
}

// ── Composant principal ───────────────────────────────────────
export default function AuditPage() {
  const { staff }                       = useContext(AuthContext)
  const [logs,       setLogs]           = useState([])
  const [resume,     setResume]         = useState([])
  const [staffList,  setStaffList]      = useState([])
  const [loading,    setLoading]        = useState(true)
  const [tab,        setTab]            = useState('logs')
  const [selected,   setSelected]       = useState(null)

  // Filtres
  const [filtreAction, setFiltreAction] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreStaff,  setFiltreStaff]  = useState('')
  const [dateDebut,    setDateDebut]    = useState('')
  const [dateFin,      setDateFin]      = useState('')

  useEffect(() => { loadAll() }, [])
  useEffect(() => { loadLogs() }, [filtreAction, filtreStatut, filtreStaff, dateDebut, dateFin])

  async function loadAll() {
    const [l, r, s] = await Promise.all([
      getAuditLogs({}),
      getAuditResume(),
      getStaffList(),
    ])
    setLogs(l); setResume(r); setStaffList(s)
    setLoading(false)
  }

  async function loadLogs() {
    setLoading(true)
    const data = await getAuditLogs({
      action:  filtreAction  || undefined,
      statut:  filtreStatut  || undefined,
      staffId: filtreStaff   || undefined,
      debut:   dateDebut     || undefined,
      fin:     dateFin       || undefined,
    })
    setLogs(data)
    setLoading(false)
  }

  // Stats globales
  const totalAujourd = logs.filter(l =>
    new Date(l.created_at).toDateString() === new Date().toDateString()
  ).length
  const warnings = logs.filter(l => l.statut === 'warning').length
  const failures = logs.filter(l => l.statut === 'failure').length

  if (loading && !logs.length) return <div className="loader"><div className="spinner" /></div>

  return (
    <div>
      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {['logs','resume'].map(t => (
          <button key={t} className={`btn ${tab===t?'btn-primary':'btn-outline'} btn-sm`}
            onClick={() => setTab(t)}>
            {t==='logs' ? '📋 Journal d\'activité' : '📊 Résumé 30 jours'}
          </button>
        ))}
      </div>

      {/* ── ONGLET LOGS ── */}
      {tab === 'logs' && (
        <>
          {/* Stats rapides */}
          <div className="grid-4" style={{ marginBottom:20 }}>
            {[
              { label:'Actions aujourd\'hui', value:totalAujourd,  color:'var(--g4)',      icon:'📋' },
              { label:'Total affiché',        value:logs.length,   color:'var(--t1)',      icon:'📝' },
              { label:'Avertissements',       value:warnings,      color:'#E65100',        icon:'⚠️' },
              { label:'Échecs',               value:failures,      color:'var(--danger2)', icon:'❌' },
            ].map((s, i) => (
              <div key={i} className="stat-card">
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <div className="stat-label">{s.label}</div>
                  <span style={{ fontSize:18 }}>{s.icon}</span>
                </div>
                <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Filtres */}
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
              <div>
                <div className="form-label">Action</div>
                <select className="form-input form-select" value={filtreAction}
                  onChange={e => setFiltreAction(e.target.value)} style={{ width:200 }}>
                  <option value="">Toutes les actions</option>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="form-label">Statut</div>
                <select className="form-input form-select" value={filtreStatut}
                  onChange={e => setFiltreStatut(e.target.value)} style={{ width:160 }}>
                  <option value="">Tous</option>
                  <option value="success">✅ Succès</option>
                  <option value="warning">⚠️ Avertissement</option>
                  <option value="failure">❌ Échec</option>
                </select>
              </div>
              <div>
                <div className="form-label">Staff</div>
                <select className="form-input form-select" value={filtreStaff}
                  onChange={e => setFiltreStaff(e.target.value)} style={{ width:180 }}>
                  <option value="">Tout le staff</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.prenom} {s.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="form-label">Du</div>
                <input className="form-input" type="date" value={dateDebut}
                  onChange={e => setDateDebut(e.target.value)} style={{ width:150 }} />
              </div>
              <div>
                <div className="form-label">Au</div>
                <input className="form-input" type="date" value={dateFin}
                  onChange={e => setDateFin(e.target.value)} style={{ width:150 }} />
              </div>
              <button className="btn btn-outline btn-sm"
                onClick={() => { setFiltreAction(''); setFiltreStatut(''); setFiltreStaff(''); setDateDebut(''); setDateFin('') }}>
                🔄 Réinitialiser
              </button>
            </div>
          </div>

          {/* Tableau logs */}
          <div className="card">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h4>Journal d'activité</h4>
              <span style={{ fontSize:12, color:'var(--t3)' }}>{logs.length} entrée{logs.length>1?'s':''}</span>
            </div>
            {loading ? <div className="loader"><div className="spinner" /></div> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Staff</th>
                      <th>Action</th>
                      <th>Détails</th>
                      <th>Table</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => {
                      const a = ACTION_LABELS[log.action] || { label:log.action, icon:'📝', color:'var(--t2)' }
                      const s = STATUT_CONFIG[log.statut] || STATUT_CONFIG.success
                      return (
                        <tr key={log.id} style={{ cursor:'pointer' }} onClick={() => setSelected(log)}>
                          <td style={{ fontSize:12, color:'var(--t3)', whiteSpace:'nowrap' }}>
                            {new Date(log.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' })}
                          </td>
                          <td>
                            {log.staff
                              ? <div>
                                  <div style={{ fontSize:13, fontWeight:600 }}>{log.staff.prenom} {log.staff.nom}</div>
                                  <div style={{ fontSize:11, color:'var(--t3)' }}>{log.staff.role}</div>
                                </div>
                              : <span style={{ color:'var(--t3)' }}>Système</span>}
                          </td>
                          <td>
                            <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:a.color }}>
                              <span style={{ fontSize:16 }}>{a.icon}</span>
                              {a.label}
                            </span>
                          </td>
                          <td style={{ fontSize:13, color:'var(--t2)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {log.details || '—'}
                          </td>
                          <td style={{ fontSize:12 }}>
                            {log.table_name
                              ? <span className="badge badge-gray" style={{ fontSize:10 }}>{log.table_name}</span>
                              : '—'}
                          </td>
                          <td>
                            <span style={{ padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600, background:s.bg, color:s.color }}>
                              {s.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── ONGLET RÉSUMÉ ── */}
      {tab === 'resume' && (
        <div className="card">
          <h4 style={{ marginBottom:16 }}>Activité des 30 derniers jours</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Jour</th>
                  <th>Total actions</th>
                  <th>Commandes</th>
                  <th>Encaissements</th>
                  <th>Modif. stock</th>
                  <th>Modif. staff</th>
                  <th>⚠️ Avert.</th>
                  <th>❌ Échecs</th>
                </tr>
              </thead>
              <tbody>
                {resume.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight:600, whiteSpace:'nowrap' }}>
                      {new Date(r.jour).toLocaleDateString('fr-FR', { weekday:'short', day:'2-digit', month:'2-digit' })}
                    </td>
                    <td style={{ fontWeight:700, color:'var(--g4)' }}>{r.total_actions}</td>
                    <td>{r.commandes}</td>
                    <td>{r.encaissements}</td>
                    <td>{r.modifs_stock}</td>
                    <td style={{ color:r.modifs_staff>0?'#E65100':'' }}>{r.modifs_staff}</td>
                    <td>
                      {r.avertissements > 0
                        ? <span style={{ color:'#E65100', fontWeight:700 }}>{r.avertissements}</span>
                        : '—'}
                    </td>
                    <td>
                      {r.echecs > 0
                        ? <span style={{ color:'var(--danger2)', fontWeight:700 }}>{r.echecs}</span>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal détail log */}
      {selected && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setSelected(null) }}>
          <div className="modal" style={{ maxWidth:540 }}>
            <div className="modal-header">
              <div className="modal-title">
                {ACTION_LABELS[selected.action]?.icon} Détail de l'action
              </div>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px', fontSize:13, marginBottom:16, padding:14, background:'var(--g1)', borderRadius:10 }}>
              <div>
                <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Date</div>
                <div style={{ fontWeight:600 }}>{new Date(selected.created_at).toLocaleString('fr-FR')}</div>
              </div>
              <div>
                <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Staff</div>
                <div style={{ fontWeight:600 }}>{selected.staff ? `${selected.staff.prenom} ${selected.staff.nom}` : 'Système'}</div>
              </div>
              <div>
                <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Action</div>
                <div style={{ fontWeight:600, color:ACTION_LABELS[selected.action]?.color }}>
                  {ACTION_LABELS[selected.action]?.icon} {ACTION_LABELS[selected.action]?.label || selected.action}
                </div>
              </div>
              <div>
                <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Statut</div>
                <div style={{ fontWeight:600, color:STATUT_CONFIG[selected.statut]?.color }}>
                  {STATUT_CONFIG[selected.statut]?.label}
                </div>
              </div>
              {selected.table_name && (
                <div>
                  <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Table</div>
                  <div style={{ fontWeight:600 }}>{selected.table_name}</div>
                </div>
              )}
              {selected.record_id && (
                <div>
                  <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>ID enregistrement</div>
                  <div style={{ fontFamily:'monospace', fontSize:11 }}>{selected.record_id.slice(0,18)}...</div>
                </div>
              )}
              {selected.details && (
                <div style={{ gridColumn:'1/-1' }}>
                  <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Détails</div>
                  <div style={{ fontWeight:600 }}>{selected.details}</div>
                </div>
              )}
            </div>

            {/* Données avant/après */}
            {(selected.old_data || selected.new_data) && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {selected.old_data && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:600, color:'var(--danger2)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>
                      Avant
                    </div>
                    <div style={{ background:'var(--danger)', borderRadius:8, padding:10, fontSize:12, fontFamily:'monospace', color:'var(--danger2)' }}>
                      {Object.entries(selected.old_data).map(([k, v]) => (
                        <div key={k}><strong>{k}</strong> : {String(v)}</div>
                      ))}
                    </div>
                  </div>
                )}
                {selected.new_data && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:600, color:'var(--g4)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>
                      Après
                    </div>
                    <div style={{ background:'var(--g1)', borderRadius:8, padding:10, fontSize:12, fontFamily:'monospace', color:'var(--g4)' }}>
                      {Object.entries(selected.new_data).map(([k, v]) => (
                        <div key={k}><strong>{k}</strong> : {String(v)}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
