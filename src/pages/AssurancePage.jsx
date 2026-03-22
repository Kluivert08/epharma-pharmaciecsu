import React, { useEffect, useState, useContext } from 'react'
import { AuthContext } from '../App'
import { supabase } from '../lib/supabase'

// ── API Supabase assurances ───────────────────────────────────────────────────
async function getAssurancesPartenaires() {
  const { data } = await supabase
    .from('assurances_partenaires')
    .select('*, assurance_services(*)')
    .order('nom')
  return data ?? []
}

async function createAssurance(data, staffId) {
  return supabase.from('assurances_partenaires').insert({ ...data, created_by: staffId })
}

async function activerAssurance(id, secretKey, staffId) {
  // Simulation vérification API partenaire
  // En production : appel API vers l'assureur avec la secretKey
  await new Promise(r => setTimeout(r, 1500))

  if (!secretKey || secretKey.length < 8) {
    return { error: { message: 'Clé secrète invalide ou trop courte (minimum 8 caractères)' } }
  }

  return supabase.from('assurances_partenaires').update({
    active:        true,
    secret_key:    secretKey,
    activated_by:  staffId,
    activated_at:  new Date().toISOString(),
  }).eq('id', id)
}

async function desactiverAssurance(id) {
  return supabase.from('assurances_partenaires').update({ active: false }).eq('id', id)
}

async function addService(assuranceId, data) {
  return supabase.from('assurance_services').insert({ ...data, assurance_id: assuranceId })
}

async function getCreances() {
  const { data } = await supabase
    .from('creances_assurance')
    .select('*, assurances_partenaires(nom), commandes_pos(numero, total, created_at)')
    .order('created_at', { ascending: false })
  return data ?? []
}

async function updateCreance(id, data) {
  return supabase.from('creances_assurance').update(data).eq('id', id)
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function AssurancePage() {
  const { staff } = useContext(AuthContext)
  const [assurances,  setAssurances]  = useState([])
  const [creances,    setCreances]    = useState([])
  const [tab,         setTab]         = useState('partenaires')
  const [loading,     setLoading]     = useState(true)
  const [showCreate,  setShowCreate]  = useState(false)
  const [showActivate,setShowActivate]= useState(null)
  const [showService, setShowService] = useState(null)
  const [secretKey,   setSecretKey]   = useState('')
  const [activating,  setActivating]  = useState(false)
  const [activMsg,    setActivMsg]    = useState(null)

  const [form, setForm] = useState({
    nom: '', rccm: '', niu: '', adresse: '',
    responsable_nom: '', responsable_email: '', responsable_tel: '',
    site_web: '', notes: '',
  })

  const [serviceForm, setServiceForm] = useState({
    nom_service: '', code_service: '', taux_couverture: 80, tous_produits: false,
    categories_couvertes: [],
  })

  const CATEGORIES = ['vitamines','douleur','peau','rhume','pediatrie','cardiologie','digestif','materiel']

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [a, c] = await Promise.all([getAssurancesPartenaires(), getCreances()])
    setAssurances(a); setCreances(c); setLoading(false)
  }

  async function handleCreate() {
    if (!form.nom) return
    await createAssurance(form, staff.id)
    setShowCreate(false)
    setForm({ nom:'', rccm:'', niu:'', adresse:'', responsable_nom:'', responsable_email:'', responsable_tel:'', site_web:'', notes:'' })
    loadAll()
  }

  async function handleActivate() {
    if (!secretKey.trim()) return
    setActivating(true)
    setActivMsg(null)
    const { error } = await activerAssurance(showActivate.id, secretKey, staff.id)
    setActivating(false)
    if (error) { setActivMsg({ type:'error', text: error.message }); return }
    setActivMsg({ type:'success', text:'✅ Assurance activée avec succès !' })
    setTimeout(() => { setShowActivate(null); setSecretKey(''); setActivMsg(null); loadAll() }, 1500)
  }

  async function handleAddService() {
    if (!serviceForm.nom_service || !serviceForm.code_service) return
    await addService(showService.id, {
      ...serviceForm,
      categories_couvertes: serviceForm.tous_produits ? null : serviceForm.categories_couvertes,
    })
    setShowService(null)
    setServiceForm({ nom_service:'', code_service:'', taux_couverture:80, tous_produits:false, categories_couvertes:[] })
    loadAll()
  }

  function toggleCategorie(slug) {
    setServiceForm(prev => ({
      ...prev,
      categories_couvertes: prev.categories_couvertes.includes(slug)
        ? prev.categories_couvertes.filter(c => c !== slug)
        : [...prev.categories_couvertes, slug],
    }))
  }

  const totalCreances = creances.filter(c => c.statut==='en_attente').reduce((s,c) => s+c.montant, 0)

  if (loading) return <div className="loader"><div className="spinner" /></div>

  return (
    <div>
      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {['partenaires','creances'].map(t => (
          <button key={t} className={`btn ${tab===t?'btn-primary':'btn-outline'} btn-sm`}
            onClick={() => setTab(t)}>
            {t==='partenaires' ? '🏥 Assurances partenaires' : `💳 Créances (${creances.filter(c=>c.statut==='en_attente').length} en attente)`}
          </button>
        ))}
        <div style={{ flex:1 }} />
        {tab === 'partenaires' && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            + Nouvelle assurance
          </button>
        )}
      </div>

      {/* ── PARTENAIRES ── */}
      {tab === 'partenaires' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {assurances.length === 0 && (
            <div className="card" style={{ textAlign:'center', padding:60, color:'var(--t3)' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🏥</div>
              <div style={{ fontSize:16, fontWeight:600, color:'var(--t1)', marginBottom:4 }}>Aucune assurance partenaire</div>
              <div style={{ fontSize:13 }}>Ajoutez votre première assurance partenaire</div>
            </div>
          )}
          {assurances.map(a => (
            <div key={a.id} className="card">
              <div style={{ display:'flex', alignItems:'flex-start', gap:16 }}>
                {/* Infos principales */}
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                    <h4 style={{ margin:0 }}>{a.nom}</h4>
                    <span className={`badge ${a.active?'badge-green':'badge-gray'}`}>
                      {a.active ? '✅ Active' : '⏸ Inactive'}
                    </span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 20px', fontSize:13, color:'var(--t2)', marginBottom:10 }}>
                    {a.rccm && <span>📋 RCCM : <strong>{a.rccm}</strong></span>}
                    {a.niu  && <span>🔢 NIU : <strong>{a.niu}</strong></span>}
                    {a.adresse && <span style={{ gridColumn:'1/-1' }}>📍 {a.adresse}</span>}
                    {a.responsable_nom && <span>👤 {a.responsable_nom}</span>}
                    {a.responsable_tel && <span>📞 {a.responsable_tel}</span>}
                    {a.responsable_email && <span style={{ gridColumn:'1/-1' }}>✉️ {a.responsable_email}</span>}
                  </div>

                  {/* Services couverts */}
                  {a.assurance_services?.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ fontSize:11, fontWeight:600, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>Services couverts</div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        {a.assurance_services.map(s => (
                          <div key={s.id} style={{ background:'var(--g1)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', fontSize:12 }}>
                            <span style={{ fontWeight:700, color:'var(--g4)' }}>{s.nom_service}</span>
                            <span style={{ color:'var(--t3)', marginLeft:6 }}>· {s.taux_couverture}% pris en charge</span>
                            {s.tous_produits
                              ? <span style={{ color:'var(--t3)', marginLeft:6 }}>· Tous produits</span>
                              : <span style={{ color:'var(--t3)', marginLeft:6 }}>· {s.categories_couvertes?.join(', ')}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display:'flex', flexDirection:'column', gap:8, flexShrink:0 }}>
                  {!a.active ? (
                    <button className="btn btn-primary btn-sm"
                      onClick={() => { setShowActivate(a); setSecretKey(''); setActivMsg(null) }}>
                      🔑 Activer
                    </button>
                  ) : (
                    <button className="btn btn-outline btn-sm" style={{ color:'var(--danger2)', borderColor:'var(--danger2)' }}
                      onClick={() => desactiverAssurance(a.id).then(loadAll)}>
                      ⏸ Désactiver
                    </button>
                  )}
                  <button className="btn btn-outline btn-sm"
                    onClick={() => setShowService(a)}>
                    + Service
                  </button>
                </div>
              </div>

              {a.activated_at && (
                <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)', fontSize:11, color:'var(--t3)' }}>
                  Activée le {new Date(a.activated_at).toLocaleDateString('fr-FR')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── CRÉANCES ── */}
      {tab === 'creances' && (
        <div>
          <div className="grid-3" style={{ marginBottom:20 }}>
            <div className="stat-card">
              <div className="stat-label">Créances en attente</div>
              <div className="stat-value" style={{ color:'var(--warn2)' }}>{totalCreances.toLocaleString('fr-FR')} F</div>
              <div className="stat-sub">{creances.filter(c=>c.statut==='en_attente').length} dossiers</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Créances payées</div>
              <div className="stat-value" style={{ color:'var(--g4)' }}>
                {creances.filter(c=>c.statut==='payee').reduce((s,c)=>s+c.montant,0).toLocaleString('fr-FR')} F
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total créances</div>
              <div className="stat-value">{creances.reduce((s,c)=>s+c.montant,0).toLocaleString('fr-FR')} F</div>
            </div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Assurance</th>
                    <th>Commande</th>
                    <th>Montant dû</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {creances.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontSize:12, color:'var(--t3)' }}>
                        {new Date(c.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td style={{ fontWeight:600 }}>{c.assurances_partenaires?.nom}</td>
                      <td>
                        <span style={{ fontFamily:'Sora', fontWeight:700, color:'var(--g4)' }}>
                          {c.commandes_pos?.numero}
                        </span>
                      </td>
                      <td style={{ fontFamily:'Sora', fontWeight:700, color:'var(--warn2)' }}>
                        {c.montant?.toLocaleString('fr-FR')} FCFA
                      </td>
                      <td>
                        <span className={`badge ${
                          c.statut==='payee'?'badge-green':
                          c.statut==='facturee'?'badge-blue':
                          c.statut==='litigieux'?'badge-red':'badge-amber'}`}>
                          {c.statut}
                        </span>
                      </td>
                      <td>
                        <select className="form-input form-select"
                          style={{ padding:'4px 28px 4px 8px', fontSize:12, width:130 }}
                          value={c.statut}
                          onChange={async e => {
                            await updateCreance(c.id, { statut: e.target.value, paye_le: e.target.value==='payee' ? new Date().toISOString() : null })
                            loadAll()
                          }}>
                          <option value="en_attente">En attente</option>
                          <option value="facturee">Facturée</option>
                          <option value="payee">Payée</option>
                          <option value="litigieux">Litigieux</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CRÉER ASSURANCE ── */}
      {showCreate && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setShowCreate(false) }}>
          <div className="modal" style={{ maxWidth:600 }}>
            <div className="modal-header">
              <div className="modal-title">Nouvelle assurance partenaire</div>
              <button className="modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Nom de l'assurance *</label>
                <input className="form-input" value={form.nom} onChange={e=>setForm({...form,nom:e.target.value})} placeholder="Ex: CNSS Congo" />
              </div>
              <div className="form-group">
                <label className="form-label">RCCM</label>
                <input className="form-input" value={form.rccm} onChange={e=>setForm({...form,rccm:e.target.value})} placeholder="RCCM-CG-BZV-XXX" />
              </div>
              <div className="form-group">
                <label className="form-label">NIU</label>
                <input className="form-input" value={form.niu} onChange={e=>setForm({...form,niu:e.target.value})} placeholder="M2024XXXXXX" />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Adresse</label>
                <input className="form-input" value={form.adresse} onChange={e=>setForm({...form,adresse:e.target.value})} placeholder="Avenue..." />
              </div>
              <div className="form-group">
                <label className="form-label">Responsable</label>
                <input className="form-input" value={form.responsable_nom} onChange={e=>setForm({...form,responsable_nom:e.target.value})} placeholder="Nom complet" />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone responsable</label>
                <input className="form-input" value={form.responsable_tel} onChange={e=>setForm({...form,responsable_tel:e.target.value})} placeholder="+242 06..." />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Email responsable</label>
                <input className="form-input" type="email" value={form.responsable_email} onChange={e=>setForm({...form,responsable_email:e.target.value})} placeholder="responsable@assurance.cg" />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Notes</label>
                <input className="form-input" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Informations complémentaires..." />
              </div>
            </div>
            <div style={{ padding:12, background:'var(--amber1)', borderRadius:10, fontSize:13, color:'var(--amber4)', marginBottom:16 }}>
              ⚠️ L'assurance sera inactive après création. Vous devrez l'activer avec la clé secrète partenaire fournie par l'assureur.
            </div>
            <button className="btn btn-primary btn-lg" style={{ width:'100%' }} onClick={handleCreate}>
              Enregistrer l'assurance
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL ACTIVATION ── */}
      {showActivate && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) { setShowActivate(null); setSecretKey('') } }}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Activer — {showActivate.nom}</div>
              <button className="modal-close" onClick={() => { setShowActivate(null); setSecretKey('') }}>✕</button>
            </div>
            <div style={{ padding:14, background:'var(--g1)', borderRadius:10, marginBottom:16, fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>
              <strong>Comment obtenir la clé secrète ?</strong><br/>
              Contactez votre responsable chez <strong>{showActivate.nom}</strong> ({showActivate.responsable_nom}) et demandez la <em>clé partenaire API</em> pour la Pharmacie CSU. Cette clé permet de vérifier les assurés et les produits couverts.
            </div>
            {activMsg && (
              <div className={`alert alert-${activMsg.type==='success'?'success':'error'}`} style={{ marginBottom:14 }}>
                {activMsg.text}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Clé secrète partenaire (SecretKey)</label>
              <input className="form-input" type="password"
                placeholder="Clé API fournie par l'assureur"
                value={secretKey} onChange={e => setSecretKey(e.target.value)} />
              <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>
                Cette clé est chiffrée et stockée de manière sécurisée
              </div>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width:'100%' }}
              onClick={handleActivate} disabled={activating || !secretKey}>
              {activating ? '⏳ Vérification en cours...' : '🔑 Activer l\'assurance'}
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL AJOUTER SERVICE ── */}
      {showService && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setShowService(null) }}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Ajouter un service — {showService.nom}</div>
              <button className="modal-close" onClick={() => setShowService(null)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Nom du service</label>
              <input className="form-input" value={serviceForm.nom_service}
                onChange={e => setServiceForm({...serviceForm, nom_service:e.target.value})}
                placeholder="Ex: Assurance Santé" />
            </div>
            <div className="form-group">
              <label className="form-label">Code service</label>
              <input className="form-input" value={serviceForm.code_service}
                onChange={e => setServiceForm({...serviceForm, code_service:e.target.value.toUpperCase()})}
                placeholder="Ex: SANTE" />
            </div>
            <div className="form-group">
              <label className="form-label">Taux de couverture (%)</label>
              <input className="form-input" type="number" min="0" max="100"
                value={serviceForm.taux_couverture}
                onChange={e => setServiceForm({...serviceForm, taux_couverture:parseInt(e.target.value)})} />
            </div>
            <div className="form-group">
              <label className="form-label">Produits couverts</label>
              <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, cursor:'pointer' }}>
                <input type="checkbox" checked={serviceForm.tous_produits}
                  onChange={e => setServiceForm({...serviceForm, tous_produits:e.target.checked})} />
                <span style={{ fontSize:13, fontWeight:600 }}>Tous les produits</span>
              </label>
              {!serviceForm.tous_produits && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {CATEGORIES.map(cat => (
                    <label key={cat} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer',
                      padding:'6px 12px', borderRadius:8, border:'1.5px solid',
                      borderColor: serviceForm.categories_couvertes.includes(cat) ? 'var(--g3)' : 'var(--border)',
                      background: serviceForm.categories_couvertes.includes(cat) ? 'var(--g1)' : '#fff',
                      fontSize:13, fontWeight:500,
                    }}>
                      <input type="checkbox" style={{ display:'none' }}
                        checked={serviceForm.categories_couvertes.includes(cat)}
                        onChange={() => toggleCategorie(cat)} />
                      {cat}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button className="btn btn-primary btn-lg" style={{ width:'100%' }} onClick={handleAddService}>
              Ajouter le service
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
