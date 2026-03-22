import React, { useEffect, useState, useContext, useRef } from 'react'
import { AuthContext } from '../App'
import { supabase } from '../lib/supabase'

// ── API ───────────────────────────────────────────────────────
async function getLivraisons(role, staffId) {
  let q = supabase.from('v_livraisons').select('*')
  if (role === 'vendeuse') q = q.eq('vendeuse_id', staffId)
  const { data } = await q.limit(100)
  return data ?? []
}

async function creerLivraison(data) {
  return supabase.from('livraisons').insert(data).select().single()
}

async function updateStatutLivraison(id, statut, note = '') {
  return supabase.from('livraisons').update({ statut }).eq('id', id)
}

async function getHistorique(livraisonId) {
  const { data } = await supabase
    .from('livraisons_historique')
    .select('*')
    .eq('livraison_id', livraisonId)
    .order('created_at', { ascending: true })
  return data ?? []
}

async function getCommandesPaiees() {
  const { data } = await supabase
    .from('commandes_pos')
    .select('id, numero, total, client_nom, client_tel')
    .eq('statut', 'payee')
    .is('id', null)  // On récupère celles qui n'ont pas encore de livraison
    .limit(50)
  return data ?? []
}

// ── Constantes ────────────────────────────────────────────────
const STATUTS = {
  preparee: { label:'En préparation', icon:'📦', color:'#F9A825', bg:'#FFF8E1' },
  en_route: { label:'En route',       icon:'🚚', color:'#1565C0', bg:'#E3F2FD' },
  livree:   { label:'Livrée',         icon:'✅', color:'#2E7D32', bg:'#E8F5E9' },
  echouee:  { label:'Échec livraison',icon:'❌', color:'#C62828', bg:'#FFEBEE' },
  annulee:  { label:'Annulée',        icon:'⛔', color:'#5F5E5A', bg:'#F1EFE8' },
}

const TRANSITIONS = {
  preparee: ['en_route', 'annulee'],
  en_route: ['livree',   'echouee'],
  livree:   [],
  echouee:  ['preparee'],
  annulee:  [],
}

// ── Composant carte livraison ─────────────────────────────────
function LivraisonCard({ liv, onUpdate, onDetail, isAdmin }) {
  const s = STATUTS[liv.statut] || STATUTS.preparee
  const duree = liv.livree_le && liv.preparee_le
    ? Math.round((new Date(liv.livree_le) - new Date(liv.preparee_le)) / 60000)
    : null

  return (
    <div className="card" style={{ borderLeft:`4px solid ${s.color}`, transition:'all .15s' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
        <div style={{ fontSize:28, flexShrink:0 }}>{s.icon}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontFamily:'Sora', fontSize:16, fontWeight:700, color:'var(--g4)' }}>{liv.numero}</span>
            <span style={{ padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600, background:s.bg, color:s.color }}>{s.label}</span>
            {liv.commande_numero && (
              <span style={{ fontSize:11, color:'var(--t3)' }}>· {liv.commande_numero}</span>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 16px', fontSize:13, color:'var(--t2)', marginBottom:8 }}>
            <span>📍 {liv.adresse}</span>
            <span>🏙️ {liv.ville}</span>
            {liv.client_nom && <span>👤 {liv.client_nom}</span>}
            {liv.livreur_nom && <span>🛵 {liv.livreur_nom}</span>}
            {liv.livreur_tel && <span>📞 {liv.livreur_tel}</span>}
            {isAdmin && liv.vendeuse && <span>👩 {liv.vendeuse}</span>}
          </div>
          {/* Timeline mini */}
          <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:8 }}>
            {['preparee','en_route','livree'].map((st, i) => {
              const done = st === 'preparee' ||
                (st === 'en_route' && ['en_route','livree'].includes(liv.statut)) ||
                (st === 'livree'   && liv.statut === 'livree')
              const s2 = STATUTS[st]
              return (
                <React.Fragment key={st}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                    <div style={{ width:24, height:24, borderRadius:8, background:done?s2.color:'var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>
                      {done ? s2.icon : '○'}
                    </div>
                    <span style={{ fontSize:9, color:done?s2.color:'var(--t3)', fontWeight:done?600:400 }}>{st === 'preparee' ? 'Prêt' : st === 'en_route' ? 'Route' : 'Livré'}</span>
                  </div>
                  {i < 2 && <div style={{ flex:1, height:2, background:done&&i<1?'var(--g3)':done&&i===1&&liv.statut==='livree'?'var(--g3)':'var(--border)', borderRadius:1 }} />}
                </React.Fragment>
              )
            })}
            {duree && <span style={{ fontSize:11, color:'var(--t3)', marginLeft:8 }}>⏱️ {duree} min</span>}
          </div>
          <div style={{ fontSize:11, color:'var(--t3)' }}>
            {new Date(liv.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
          <button className="btn btn-outline btn-sm" onClick={() => onDetail(liv)}>Détail</button>
          {TRANSITIONS[liv.statut]?.map(next => (
            <button key={next} className="btn btn-sm"
              style={{ background:STATUTS[next].color, color:'#fff', border:'none' }}
              onClick={() => onUpdate(liv.id, next)}>
              {STATUTS[next].icon} {next === 'en_route' ? 'Départ' : next === 'livree' ? 'Livrée' : next === 'echouee' ? 'Échec' : next === 'annulee' ? 'Annuler' : next === 'preparee' ? 'Reprendre' : next}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────
export default function LivraisonsPage() {
  const { staff }                         = useContext(AuthContext)
  const [livraisons,   setLivraisons]     = useState([])
  const [loading,      setLoading]        = useState(true)
  const [showCreate,   setShowCreate]     = useState(false)
  const [showDetail,   setShowDetail]     = useState(null)
  const [historique,   setHistorique]     = useState([])
  const [filtreStatut, setFiltreStatut]   = useState('all')
  const [search,       setSearch]         = useState('')
  const [form, setForm] = useState({
    adresse:'', ville:'Pointe-Noire', livreur_nom:'', livreur_tel:'',
    commande_id:'', notes:'', frais_livraison:0,
  })

  const isAdmin = staff?.role === 'admin'
  const channelRef = useRef(null)

  useEffect(() => {
    loadData()
    // Realtime
    channelRef.current = supabase
      .channel('livraisons_rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'livraisons' }, () => loadData())
      .subscribe()
    return () => channelRef.current?.unsubscribe()
  }, [])

  async function loadData() {
    const data = await getLivraisons(staff?.role, staff?.id)
    setLivraisons(data)
    setLoading(false)
  }

  async function handleCreate() {
    if (!form.adresse) return
    const { error } = await creerLivraison({ ...form, vendeuse_id: staff?.id })
    if (error) { alert('Erreur: ' + error.message); return }
    setShowCreate(false)
    setForm({ adresse:'', ville:'Pointe-Noire', livreur_nom:'', livreur_tel:'', commande_id:'', notes:'', frais_livraison:0 })
    loadData()
  }

  async function handleUpdate(id, statut) {
    await updateStatutLivraison(id, statut)
    loadData()
  }

  async function openDetail(liv) {
    setShowDetail(liv)
    const hist = await getHistorique(liv.id)
    setHistorique(hist)
  }

  const filtered = livraisons.filter(l => {
    const matchStatut = filtreStatut === 'all' || l.statut === filtreStatut
    const matchSearch = !search || l.numero?.toLowerCase().includes(search.toLowerCase()) ||
      l.adresse?.toLowerCase().includes(search.toLowerCase()) ||
      l.client_nom?.toLowerCase().includes(search.toLowerCase())
    return matchStatut && matchSearch
  })

  // Stats
  const stats = {
    total:    livraisons.length,
    preparee: livraisons.filter(l => l.statut === 'preparee').length,
    en_route: livraisons.filter(l => l.statut === 'en_route').length,
    livree:   livraisons.filter(l => l.statut === 'livree').length,
    echouee:  livraisons.filter(l => l.statut === 'echouee').length,
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>

  return (
    <div>
      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Total',        value:stats.total,    color:'var(--t1)', icon:'📋' },
          { label:'En préparation',value:stats.preparee, color:'#F9A825',  icon:'📦' },
          { label:'En route',     value:stats.en_route, color:'#1565C0',  icon:'🚚' },
          { label:'Livrées',      value:stats.livree,   color:'#2E7D32',  icon:'✅' },
          { label:'Échecs',       value:stats.echouee,  color:'#C62828',  icon:'❌' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor:'pointer' }}
            onClick={() => setFiltreStatut(i === 0 ? 'all' : Object.keys(STATUTS)[i-1])}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <div className="stat-label">{s.label}</div>
              <span style={{ fontSize:18 }}>{s.icon}</span>
            </div>
            <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Barre filtres */}
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
        <input className="form-input" placeholder="🔍 Rechercher..."
          value={search} onChange={e => setSearch(e.target.value)} style={{ width:220 }} />
        <div style={{ display:'flex', gap:6 }}>
          <button className={`btn btn-sm ${filtreStatut==='all'?'btn-primary':'btn-outline'}`}
            onClick={() => setFiltreStatut('all')}>Toutes</button>
          {Object.entries(STATUTS).map(([key, s]) => (
            <button key={key}
              className={`btn btn-sm ${filtreStatut===key?'btn-primary':'btn-outline'}`}
              onClick={() => setFiltreStatut(key)}
              style={{ color:filtreStatut!==key?s.color:'', borderColor:filtreStatut!==key?s.color:'' }}>
              {s.icon}
            </button>
          ))}
        </div>
        <div style={{ flex:1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          + Nouvelle livraison
        </button>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:60, color:'var(--t3)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🚚</div>
          <div style={{ fontSize:16, fontWeight:600, color:'var(--t1)', marginBottom:4 }}>Aucune livraison</div>
          <div style={{ fontSize:13 }}>Créez votre première livraison</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {filtered.map(liv => (
            <LivraisonCard key={liv.id} liv={liv}
              onUpdate={handleUpdate} onDetail={openDetail} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {/* Modal créer livraison */}
      {showCreate && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setShowCreate(false) }}>
          <div className="modal" style={{ maxWidth:520 }}>
            <div className="modal-header">
              <div className="modal-title">Nouvelle livraison</div>
              <button className="modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Adresse de livraison *</label>
                <input className="form-input" value={form.adresse}
                  onChange={e => setForm({...form, adresse:e.target.value})}
                  placeholder="Avenue, quartier, numéro..." />
              </div>
              <div className="form-group">
                <label className="form-label">Ville</label>
                <input className="form-input" value={form.ville}
                  onChange={e => setForm({...form, ville:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Frais livraison (FCFA)</label>
                <input className="form-input" type="number" value={form.frais_livraison}
                  onChange={e => setForm({...form, frais_livraison:parseInt(e.target.value)||0})} />
              </div>
              <div className="form-group">
                <label className="form-label">Nom du livreur</label>
                <input className="form-input" value={form.livreur_nom}
                  onChange={e => setForm({...form, livreur_nom:e.target.value})}
                  placeholder="Nom complet" />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone livreur</label>
                <input className="form-input" value={form.livreur_tel}
                  onChange={e => setForm({...form, livreur_tel:e.target.value})}
                  placeholder="+242 06..." />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Notes</label>
                <input className="form-input" value={form.notes}
                  onChange={e => setForm({...form, notes:e.target.value})}
                  placeholder="Instructions spéciales..." />
              </div>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width:'100%' }} onClick={handleCreate}>
              🚚 Créer la livraison
            </button>
          </div>
        </div>
      )}

      {/* Modal détail + historique */}
      {showDetail && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setShowDetail(null) }}>
          <div className="modal" style={{ maxWidth:520 }}>
            <div className="modal-header">
              <div className="modal-title">{showDetail.numero}</div>
              <button className="modal-close" onClick={() => setShowDetail(null)}>✕</button>
            </div>

            {/* Infos */}
            <div style={{ background:'var(--g1)', borderRadius:10, padding:14, marginBottom:16 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px', fontSize:13 }}>
                <div><span style={{ color:'var(--t3)' }}>Statut</span>
                  <div style={{ fontWeight:700, color:STATUTS[showDetail.statut]?.color }}>
                    {STATUTS[showDetail.statut]?.icon} {STATUTS[showDetail.statut]?.label}
                  </div>
                </div>
                <div><span style={{ color:'var(--t3)' }}>Adresse</span><div style={{ fontWeight:600 }}>{showDetail.adresse}</div></div>
                {showDetail.livreur_nom && <div><span style={{ color:'var(--t3)' }}>Livreur</span><div style={{ fontWeight:600 }}>{showDetail.livreur_nom}</div></div>}
                {showDetail.livreur_tel && <div><span style={{ color:'var(--t3)' }}>Tél. livreur</span><div style={{ fontWeight:600 }}>{showDetail.livreur_tel}</div></div>}
                {showDetail.client_nom && <div><span style={{ color:'var(--t3)' }}>Client</span><div style={{ fontWeight:600 }}>{showDetail.client_nom}</div></div>}
                {showDetail.frais_livraison > 0 && <div><span style={{ color:'var(--t3)' }}>Frais</span><div style={{ fontWeight:600, color:'var(--g4)' }}>{showDetail.frais_livraison?.toLocaleString('fr-FR')} FCFA</div></div>}
              </div>
            </div>

            {/* Historique timeline */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
                Historique
              </div>
              <div style={{ position:'relative', paddingLeft:24 }}>
                <div style={{ position:'absolute', left:8, top:0, bottom:0, width:2, background:'var(--border)' }} />
                {historique.map((h, i) => (
                  <div key={h.id} style={{ position:'relative', marginBottom:12 }}>
                    <div style={{ position:'absolute', left:-20, top:2, width:12, height:12, borderRadius:6, background:STATUTS[h.statut]?.color||'var(--g3)', border:'2px solid #fff' }} />
                    <div style={{ fontSize:13, fontWeight:600, color:STATUTS[h.statut]?.color }}>
                      {STATUTS[h.statut]?.icon} {STATUTS[h.statut]?.label}
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)' }}>
                      {new Date(h.created_at).toLocaleString('fr-FR')}
                    </div>
                    {h.note && <div style={{ fontSize:12, color:'var(--t2)', marginTop:2 }}>{h.note}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions rapides */}
            {TRANSITIONS[showDetail.statut]?.length > 0 && (
              <div style={{ display:'flex', gap:8 }}>
                {TRANSITIONS[showDetail.statut].map(next => (
                  <button key={next}
                    className="btn btn-lg"
                    style={{ flex:1, background:STATUTS[next].color, color:'#fff', border:'none' }}
                    onClick={async () => {
                      await handleUpdate(showDetail.id, next)
                      setShowDetail({ ...showDetail, statut: next })
                      const hist = await getHistorique(showDetail.id)
                      setHistorique(hist)
                    }}>
                    {STATUTS[next].icon} {next === 'en_route' ? 'Marquer En route' : next === 'livree' ? 'Confirmer livraison' : next === 'echouee' ? 'Marquer Échec' : next === 'annulee' ? 'Annuler' : 'Reprendre'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
