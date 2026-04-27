import React, { useEffect, useState, useContext } from 'react'
import { AuthContext } from '../App'
import {
  getFournisseurs,
  createFournisseur,
  updateFournisseur,
  desactiverFournisseur,
  logAudit,
} from '../lib/supabase'

const FORM_VIDE = {
  nom: '', contact: '', telephone: '', email: '',
  adresse: '', numero_contribuable: '', rib_bancaire: '',
  delai_paiement_jours: 30,
}

export default function FournisseursPage() {
  const { staff } = useContext(AuthContext)
  const peutModifier = ['superadmin', 'admin', 'comptable'].includes(staff?.role)

  const [fournisseurs, setFournisseurs] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [showModal,    setShowModal]    = useState(false)
  const [editing,      setEditing]      = useState(null)
  const [form,         setForm]         = useState(FORM_VIDE)
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await getFournisseurs()
    setFournisseurs(data)
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm(FORM_VIDE)
    setMsg(null)
    setShowModal(true)
  }

  function openEdit(f) {
    setEditing(f)
    setForm({
      nom:                  f.nom,
      contact:              f.contact              || '',
      telephone:            f.telephone            || '',
      email:                f.email                || '',
      adresse:              f.adresse              || '',
      numero_contribuable:  f.numero_contribuable  || '',
      rib_bancaire:         f.rib_bancaire         || '',
      delai_paiement_jours: f.delai_paiement_jours || 30,
    })
    setMsg(null)
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nom.trim()) return
    setSaving(true)
    try {
      if (editing) {
        await updateFournisseur(editing.id, form)
        await logAudit({ staffId: staff.id, action: 'update_fournisseur', tableName: 'fournisseurs', recordId: editing.id, details: form.nom })
      } else {
        await createFournisseur({ ...form, created_by: staff.id })
        await logAudit({ staffId: staff.id, action: 'create_fournisseur', tableName: 'fournisseurs', details: form.nom })
      }
      setShowModal(false)
      await load()
    } catch (err) {
      setMsg({ type: 'error', text: 'Erreur lors de la sauvegarde.' })
    }
    setSaving(false)
  }

  async function handleDesactiver(f) {
    if (!confirm(`Désactiver ${f.nom} ?`)) return
    await desactiverFournisseur(f.id)
    await logAudit({ staffId: staff.id, action: 'delete_fournisseur', tableName: 'fournisseurs', recordId: f.id, details: f.nom })
    await load()
  }

  const liste = fournisseurs.filter(f =>
    f.nom.toLowerCase().includes(search.toLowerCase()) ||
    f.contact?.toLowerCase().includes(search.toLowerCase()) ||
    f.telephone?.includes(search)
  )

  if (loading) return <div className="loader"><div className="spinner" /></div>

  return (
    <div className="fade-in">

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h2 style={{ margin:0 }}>🏢 Fournisseurs</h2>
          <div style={{ color:'var(--t3)', fontSize:13, marginTop:2 }}>{fournisseurs.length} fournisseur{fournisseurs.length > 1 ? 's' : ''} actif{fournisseurs.length > 1 ? 's' : ''}</div>
        </div>
        {peutModifier && (
          <button className="btn btn-primary" onClick={openCreate}>
            + Nouveau fournisseur
          </button>
        )}
      </div>

      {/* Recherche */}
      <div className="card" style={{ padding:'10px 14px', marginBottom:20 }}>
        <input
          className="form-input"
          placeholder="🔍 Rechercher par nom, contact, téléphone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border:'none', padding:0, fontSize:14, outline:'none', width:'100%', background:'transparent' }}
        />
      </div>

      {/* Grille */}
      {liste.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:60, color:'var(--t3)' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🏢</div>
          <div style={{ fontWeight:600, color:'var(--t1)', marginBottom:4 }}>Aucun fournisseur trouvé</div>
          {peutModifier && <div style={{ fontSize:13 }}>Cliquez sur "Nouveau fournisseur" pour commencer</div>}
        </div>
      ) : (
        <div className="grid-3">
          {liste.map(f => (
            <div key={f.id} className="card" style={{ display:'flex', flexDirection:'column', gap:0 }}>

              {/* En-tête carte */}
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{
                    width:44, height:44, borderRadius:12,
                    background:'var(--g1)', border:'1px solid var(--g2)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:20, flexShrink:0,
                  }}>🏢</div>
                  <div>
                    <div style={{ fontFamily:'Sora', fontWeight:700, fontSize:15, color:'var(--t1)' }}>{f.nom}</div>
                    {f.contact && <div style={{ fontSize:12, color:'var(--t3)', marginTop:1 }}>{f.contact}</div>}
                  </div>
                </div>
                {peutModifier && (
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn-icon" style={{ padding:6, fontSize:13 }} onClick={() => openEdit(f)} title="Modifier">✏️</button>
                    <button className="btn-icon" style={{ padding:6, fontSize:13, color:'var(--danger2)' }} onClick={() => handleDesactiver(f)} title="Désactiver">🗑</button>
                  </div>
                )}
              </div>

              {/* Infos */}
              <div style={{ display:'flex', flexDirection:'column', gap:7, fontSize:13, marginBottom:14 }}>
                {f.telephone && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--t2)' }}>
                    <span style={{ fontSize:14 }}>📞</span> {f.telephone}
                  </div>
                )}
                {f.email && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--t2)' }}>
                    <span style={{ fontSize:14 }}>✉️</span>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.email}</span>
                  </div>
                )}
                {f.adresse && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--t2)' }}>
                    <span style={{ fontSize:14 }}>📍</span>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.adresse}</span>
                  </div>
                )}
              </div>

              {/* Pied de carte */}
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:12, display:'flex', flexWrap:'wrap', gap:8 }}>
                <span className="badge badge-green">⏱ {f.delai_paiement_jours}j paiement</span>
                {f.numero_contribuable && (
                  <span className="badge badge-gray">N° {f.numero_contribuable}</span>
                )}
                {f.rib_bancaire && (
                  <span className="badge badge-blue">🏦 RIB enregistré</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:560 }}>
            <div className="modal-header">
              <span className="modal-title">
                {editing ? '✏️ Modifier le fournisseur' : '+ Nouveau fournisseur'}
              </span>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {msg && (
              <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom:14 }}>
                {msg.text}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

                <div className="form-group" style={{ gridColumn:'1 / -1' }}>
                  <label className="form-label">Nom du fournisseur <span style={{ color:'var(--danger2)' }}>*</span></label>
                  <input className="form-input" required value={form.nom}
                    onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Ex: Pharma Congo SARL" />
                </div>

                <div className="form-group">
                  <label className="form-label">Personne de contact</label>
                  <input className="form-input" value={form.contact}
                    onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Nom du représentant" />
                </div>

                <div className="form-group">
                  <label className="form-label">Téléphone</label>
                  <input className="form-input" type="tel" value={form.telephone}
                    onChange={e => setForm({ ...form, telephone: e.target.value })} placeholder="+242 06 XXX XX XX" />
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contact@fournisseur.cg" />
                </div>

                <div className="form-group">
                  <label className="form-label">Délai de paiement (jours)</label>
                  <input className="form-input" type="number" min="0" max="365" value={form.delai_paiement_jours}
                    onChange={e => setForm({ ...form, delai_paiement_jours: parseInt(e.target.value) || 30 })} />
                </div>

                <div className="form-group" style={{ gridColumn:'1 / -1' }}>
                  <label className="form-label">Adresse</label>
                  <textarea className="form-input" rows={2} value={form.adresse}
                    onChange={e => setForm({ ...form, adresse: e.target.value })} placeholder="Adresse complète" />
                </div>

                <div className="form-group">
                  <label className="form-label">N° Contribuable</label>
                  <input className="form-input" value={form.numero_contribuable}
                    onChange={e => setForm({ ...form, numero_contribuable: e.target.value })} placeholder="NIF / N° fiscal" />
                </div>

                <div className="form-group">
                  <label className="form-label">RIB Bancaire</label>
                  <input className="form-input" value={form.rib_bancaire}
                    onChange={e => setForm({ ...form, rib_bancaire: e.target.value })} placeholder="IBAN / RIB" />
                </div>
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:8 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? '⏳ Sauvegarde...' : editing ? 'Mettre à jour' : 'Créer le fournisseur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}