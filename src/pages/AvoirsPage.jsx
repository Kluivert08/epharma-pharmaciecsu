import React, { useEffect, useState, useContext } from 'react'
import { AuthContext } from '../App'
import {
  getAvoirs, creerAvoir, traiterAvoir,
  formatPrix, formatDateTime, logAudit, supabase,
} from '../lib/supabase'

// ── Exports ───────────────────────────────────────────────────
function exportCSV(avoirs) {
  const headers = ['N° Avoir','Date','Commande origine','Vendeuse','Client','Montant (FCFA)','Motif','Statut']
  const rows = avoirs.map(a => [
    a.numero,
    formatDateTime(a.created_at),
    a.commande?.numero || '',
    a.vendeuse ? `${a.vendeuse.prenom} ${a.vendeuse.nom}` : '',
    a.client_nom || 'Client comptoir',
    a.montant_total,
    a.motif,
    a.statut,
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url
  a.download = `avoirs_${new Date().toISOString().slice(0,10)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

function exportHTML(avoirs) {
  const totalMontant = avoirs.reduce((s, a) => s + Number(a.montant_total || 0), 0)
  const nbTraites    = avoirs.filter(a => a.statut === 'traite').length
  const nbAttente    = avoirs.filter(a => a.statut === 'en_attente').length

  const rows = avoirs.map(a => `
    <tr>
      <td style="font-weight:700;color:#2E7D32">${a.numero}</td>
      <td>${formatDateTime(a.created_at)}</td>
      <td>${a.commande?.numero || '—'}</td>
      <td>${a.vendeuse ? `${a.vendeuse.prenom} ${a.vendeuse.nom}` : '—'}</td>
      <td>${a.client_nom || 'Client comptoir'}</td>
      <td style="font-weight:700">${Number(a.montant_total || 0).toLocaleString('fr-FR')} FCFA</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.motif}</td>
      <td><span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${
        a.statut==='traite'?'#E8F5E9;color:#1B5E20':a.statut==='en_attente'?'#FFF8E1;color:#E65100':'#FFEBEE;color:#C62828'
      }">${a.statut==='traite'?'Traité':a.statut==='en_attente'?'En attente':'Annulé'}</span></td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Journal des Avoirs — ePharma</title>
  <style>
    body{font-family:'Segoe UI',sans-serif;margin:40px;color:#1a2e1a}
    .header{display:flex;align-items:center;gap:16px;margin-bottom:8px}
    .logo{width:48px;height:48px;background:#1B5E20;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px}
    h1{color:#1B5E20;font-size:22px;margin:0}.subtitle{color:#7A9E7A;font-size:13px;margin-bottom:28px}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
    .stat{background:#F0F7EE;border-radius:10px;padding:14px}
    .stat-label{font-size:11px;font-weight:600;color:#7A9E7A;text-transform:uppercase;margin-bottom:4px}
    .stat-value{font-size:22px;font-weight:700}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#F0F7EE;padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#7A9E7A;text-transform:uppercase;border-bottom:2px solid #C8E6C0}
    td{padding:10px 12px;border-bottom:1px solid #E8F0E8}
    tr:hover td{background:#F9FDF9}
    .footer{margin-top:28px;font-size:11px;color:#7A9E7A;text-align:center;border-top:1px solid #E8F0E8;padding-top:12px}
    @media print{body{margin:20px}}
  </style></head><body>
  <div class="header"><div class="logo">✚</div>
    <div><h1>Journal des Avoirs</h1>
    <div class="subtitle">Pharmacie CSU · Généré le ${new Date().toLocaleString('fr-FR')}</div></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-label">Total avoirs</div><div class="stat-value">${avoirs.length}</div></div>
    <div class="stat"><div class="stat-label">Montant total</div><div class="stat-value" style="color:#2E7D32;font-size:16px">${totalMontant.toLocaleString('fr-FR')} FCFA</div></div>
    <div class="stat"><div class="stat-label">Traités</div><div class="stat-value" style="color:#1B5E20">${nbTraites}</div></div>
    <div class="stat"><div class="stat-label">En attente</div><div class="stat-value" style="color:#E65100">${nbAttente}</div></div>
  </div>
  <table><thead><tr>
    <th>N° Avoir</th><th>Date</th><th>Commande</th><th>Vendeuse</th>
    <th>Client</th><th>Montant</th><th>Motif</th><th>Statut</th>
  </tr></thead><tbody>${rows}</tbody></table>
  <div class="footer">ePharma — Pharmacie CSU · ${avoirs.length} avoir(s) · Total ${totalMontant.toLocaleString('fr-FR')} FCFA</div>
  </body></html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
  window.open(URL.createObjectURL(blob), '_blank')
}

// ── Badges ────────────────────────────────────────────────────
function BadgeStatut({ statut }) {
  const map = {
    en_attente: { cls: 'badge-amber', label: '⏳ En attente' },
    traite:     { cls: 'badge-green', label: '✅ Traité' },
    annule:     { cls: 'badge-red',   label: '✕ Annulé' },
  }
  const { cls, label } = map[statut] ?? { cls: 'badge-gray', label: statut }
  return <span className={`badge ${cls}`}>{label}</span>
}

const MOTIFS = ['Produit défectueux', 'Erreur de commande', 'Produit expiré', 'Doublon', 'Autre']

// ─────────────────────────────────────────────────────────────
export default function AvoirsPage() {
  const { staff } = useContext(AuthContext)

  const [avoirs,        setAvoirs]        = useState([])
  const [loading,       setLoading]       = useState(true)
  const [showModal,     setShowModal]     = useState(false)
  const [showTraiter,   setShowTraiter]   = useState(false)
  const [selectedAvoir, setSelectedAvoir] = useState(null)
  const [saving,        setSaving]        = useState(false)

  // Filtres
  const [search,        setSearch]        = useState('')
  const [filtreStatut,  setFiltreStatut]  = useState('')
  const [filtreDebut,   setFiltreDebut]   = useState('')
  const [filtreFin,     setFiltreFin]     = useState('')

  // Formulaire nouvel avoir
  const [numCmd,        setNumCmd]        = useState('')
  const [cmdTrouvee,    setCmdTrouvee]    = useState(null)
  const [produitsRetour,setProduitsRetour]= useState([])
  const [motif,         setMotif]         = useState('')
  const [motifCustom,   setMotifCustom]   = useState('')
  const [searching,     setSearching]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await getAvoirs()
    setAvoirs(data)
    setLoading(false)
  }

  // ── Filtres appliqués ───────────────────────────────────────
  const liste = avoirs.filter(a => {
    if (filtreStatut && a.statut !== filtreStatut) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !a.numero?.toLowerCase().includes(q) &&
        !a.client_nom?.toLowerCase().includes(q) &&
        !a.commande?.numero?.toLowerCase().includes(q) &&
        !a.motif?.toLowerCase().includes(q)
      ) return false
    }
    if (filtreDebut && new Date(a.created_at) < new Date(filtreDebut)) return false
    if (filtreFin   && new Date(a.created_at) > new Date(filtreFin + 'T23:59:59')) return false
    return true
  })

  // KPIs sur la liste filtrée
  const totalMontant  = liste.reduce((s, a) => s + Number(a.montant_total || 0), 0)
  const nbEnAttente   = liste.filter(a => a.statut === 'en_attente').length
  const nbTraites     = liste.filter(a => a.statut === 'traite').length

  // ── Recherche commande ──────────────────────────────────────
  async function rechercherCommande() {
    if (!numCmd.trim()) return
    setSearching(true)
    const { data, error } = await supabase
      .from('commandes_pos')
      .select('*, lignes:commandes_pos_lignes(*, produits(nom, emoji), lot_id)')
      .eq('numero', numCmd.trim())
      .eq('statut', 'payee')
      .maybeSingle()
    setSearching(false)
    if (error || !data) { alert('Commande non trouvée ou non éligible.'); return }
    setCmdTrouvee(data)
    setProduitsRetour(data.lignes.map(l => ({ ...l, qteRetour: 0 })))
  }

  // ── Créer avoir ─────────────────────────────────────────────
  async function handleCreerAvoir() {
    const aRetourner = produitsRetour.filter(p => p.qteRetour > 0)
    if (!aRetourner.length) { alert('Sélectionnez au moins un produit.'); return }
    const motifFinal = motif === 'Autre' ? motifCustom : motif
    if (!motifFinal) { alert('Indiquez un motif.'); return }

    setSaving(true)
    try {
      const lignes = aRetourner.map(p => ({
        produit_id:    p.produit_id,
        lot_id:        p.lot_id || null,
        quantite:      p.qteRetour,
        prix_unitaire: p.prix_unitaire,
      }))
      await creerAvoir(cmdTrouvee.id, lignes, motifFinal, staff.id)
      await logAudit({ staffId: staff.id, action: 'create_avoir', tableName: 'avoirs', details: `CMD ${cmdTrouvee.numero}` })
      setShowModal(false)
      resetForm()
      await load()
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
    setSaving(false)
  }

  // ── Traiter avoir ───────────────────────────────────────────
  async function handleTraiter() {
    setSaving(true)
    const { error } = await traiterAvoir(selectedAvoir.id, staff.id)
    if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    await logAudit({ staffId: staff.id, action: 'traiter_avoir', tableName: 'avoirs', recordId: selectedAvoir.id, details: selectedAvoir.numero })
    setShowTraiter(false)
    setSaving(false)
    await load()
  }

  function resetForm() {
    setNumCmd(''); setCmdTrouvee(null); setProduitsRetour([])
    setMotif(''); setMotifCustom('')
  }

  const montantAvoir = produitsRetour.reduce((s, p) => s + p.qteRetour * p.prix_unitaire, 0)

  if (loading) return <div className="loader"><div className="spinner" /></div>

  return (
    <div className="fade-in">

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 style={{ margin:0 }}>↩️ Journal des Avoirs</h2>
          <div style={{ color:'var(--t3)', fontSize:13, marginTop:2 }}>{avoirs.length} avoir(s) enregistré(s)</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => exportCSV(liste)}>⬇ CSV</button>
          <button className="btn btn-outline btn-sm" onClick={() => exportHTML(liste)}>🖨 Rapport PDF</button>
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true) }}>
            + Nouvel avoir
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid-4" style={{ marginBottom:20 }}>
        {[
          { label:'Total avoirs',   value: liste.length,                      icon:'↩️',  color:'var(--t1)' },
          { label:'Montant total',  value: formatPrix(totalMontant),           icon:'💰', color:'var(--g4)' },
          { label:'En attente',     value: nbEnAttente,                        icon:'⏳', color:'var(--warn2)' },
          { label:'Traités',        value: nbTraites,                          icon:'✅', color:'var(--g4)' },
        ].map(k => (
          <div key={k.label} className="stat-card">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div className="stat-label">{k.label}</div>
              <span style={{ fontSize:22 }}>{k.icon}</span>
            </div>
            <div className="stat-value" style={{ color:k.color, fontSize:22 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="card" style={{ marginBottom:16, display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div style={{ flex:2, minWidth:180 }}>
          <div className="form-label">Recherche</div>
          <input className="form-input" placeholder="N° avoir, client, commande, motif..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ minWidth:140 }}>
          <div className="form-label">Statut</div>
          <select className="form-input form-select" value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}>
            <option value="">Tous</option>
            <option value="en_attente">En attente</option>
            <option value="traite">Traité</option>
            <option value="annule">Annulé</option>
          </select>
        </div>
        <div style={{ minWidth:140 }}>
          <div className="form-label">Du</div>
          <input className="form-input" type="date" value={filtreDebut} onChange={e => setFiltreDebut(e.target.value)} />
        </div>
        <div style={{ minWidth:140 }}>
          <div className="form-label">Au</div>
          <input className="form-input" type="date" value={filtreFin} onChange={e => setFiltreFin(e.target.value)} />
        </div>
        {(search || filtreStatut || filtreDebut || filtreFin) && (
          <button className="btn btn-outline btn-sm" style={{ alignSelf:'flex-end' }}
            onClick={() => { setSearch(''); setFiltreStatut(''); setFiltreDebut(''); setFiltreFin('') }}>
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* Tableau */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>N° Avoir</th>
                <th>Date</th>
                <th>Commande</th>
                <th>Vendeuse</th>
                <th>Client</th>
                <th>Produits</th>
                <th>Montant</th>
                <th>Motif</th>
                <th>Statut</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {liste.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign:'center', padding:48, color:'var(--t3)' }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>↩️</div>
                  Aucun avoir{search || filtreStatut ? ' pour ces filtres' : ' enregistré'}
                </td></tr>
              ) : liste.map(a => (
                <tr key={a.id}>
                  <td style={{ fontFamily:'Sora', fontWeight:700, color:'var(--g4)' }}>{a.numero}</td>
                  <td style={{ color:'var(--t3)', fontSize:12 }}>{formatDateTime(a.created_at)}</td>
                  <td style={{ fontSize:12 }}>{a.commande?.numero || '—'}</td>
                  <td style={{ fontSize:12 }}>
                    {a.vendeuse ? `${a.vendeuse.prenom} ${a.vendeuse.nom}` : '—'}
                  </td>
                  <td>{a.client_nom || <span style={{ color:'var(--t3)' }}>Comptoir</span>}</td>
                  <td style={{ fontSize:12 }}>
                    {a.lignes?.length
                      ? a.lignes.map(l => `${l.produits?.nom} ×${l.quantite}`).join(', ')
                      : '—'}
                  </td>
                  <td style={{ fontFamily:'Sora', fontWeight:700, color:'var(--g4)', whiteSpace:'nowrap' }}>
                    {formatPrix(a.montant_total)}
                  </td>
                  <td style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:12 }}
                    title={a.motif}>{a.motif}</td>
                  <td><BadgeStatut statut={a.statut} /></td>
                  <td>
                    {a.statut === 'en_attente' && (
                      <button className="btn btn-primary btn-sm"
                        onClick={() => { setSelectedAvoir(a); setShowTraiter(true) }}>
                        ✅ Traiter
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {liste.length > 0 && (
          <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', gap:24, fontSize:13, color:'var(--t3)' }}>
            <span>{liste.length} avoir(s)</span>
            <span style={{ fontWeight:700, color:'var(--g4)' }}>Total : {formatPrix(totalMontant)}</span>
          </div>
        )}
      </div>

      {/* ── MODAL Nouvel avoir ─────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:620 }}>
            <div className="modal-header">
              <span className="modal-title">↩️ Nouvel avoir — Retour produit</span>
              <button className="modal-close" onClick={() => { setShowModal(false); resetForm() }}>✕</button>
            </div>

            {/* Étape 1 : recherche commande */}
            {!cmdTrouvee ? (
              <div style={{ padding:'4px 0 8px' }}>
                <div style={{ background:'var(--g1)', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'var(--t2)' }}>
                  📋 Saisissez le numéro de la commande payée à retourner
                </div>
                <div className="form-group">
                  <label className="form-label">N° de commande</label>
                  <div style={{ display:'flex', gap:8 }}>
                    <input className="form-input" style={{ flex:1 }} placeholder="CMD-20250101-00001"
                      value={numCmd} onChange={e => setNumCmd(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && rechercherCommande()} />
                    <button className="btn btn-primary" onClick={rechercherCommande} disabled={searching}>
                      {searching ? '⏳' : '🔍 Chercher'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* Commande trouvée */}
                <div style={{ background:'var(--g1)', border:'1px solid var(--g2)', borderRadius:10, padding:'12px 16px', marginBottom:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontFamily:'Sora', fontWeight:700, color:'var(--g4)' }}>{cmdTrouvee.numero}</div>
                      <div style={{ fontSize:13, color:'var(--t3)' }}>
                        {cmdTrouvee.client_nom || 'Client comptoir'} · {formatPrix(cmdTrouvee.total)}
                      </div>
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={resetForm}>Changer</button>
                  </div>
                </div>

                {/* Produits */}
                <div style={{ marginBottom:14 }}>
                  <div className="form-label" style={{ marginBottom:8 }}>Produits à retourner</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {produitsRetour.map(p => (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--g1)', borderRadius:10, padding:'10px 14px' }}>
                        <div>
                          <div style={{ fontWeight:600, fontSize:14 }}>
                            {p.produits?.emoji} {p.produits?.nom}
                          </div>
                          <div style={{ fontSize:12, color:'var(--t3)' }}>
                            Acheté : {p.quantite} × {formatPrix(p.prix_unitaire)}
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:12, color:'var(--t3)' }}>Qté retour</span>
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <button className="qty-btn" onClick={() => setProduitsRetour(produitsRetour.map(x => x.id===p.id ? {...x, qteRetour: Math.max(0, x.qteRetour-1)} : x))}>−</button>
                            <span style={{ width:28, textAlign:'center', fontWeight:700, fontFamily:'Sora' }}>{p.qteRetour}</span>
                            <button className="qty-btn" onClick={() => setProduitsRetour(produitsRetour.map(x => x.id===p.id ? {...x, qteRetour: Math.min(x.quantite, x.qteRetour+1)} : x))}>+</button>
                          </div>
                          <span style={{ fontSize:11, color:'var(--t3)' }}>/ {p.quantite}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Motif */}
                <div className="form-group">
                  <label className="form-label">Motif du retour <span style={{ color:'var(--danger2)' }}>*</span></label>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                    {MOTIFS.map(m => (
                      <button key={m} onClick={() => setMotif(m)}
                        style={{ padding:'5px 12px', borderRadius:20, border:'1.5px solid', fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'Plus Jakarta Sans',
                          borderColor: motif===m ? 'var(--g4)' : 'var(--border)',
                          background:  motif===m ? 'var(--g1)' : '#fff',
                          color:       motif===m ? 'var(--g4)' : 'var(--t2)',
                        }}>
                        {m}
                      </button>
                    ))}
                  </div>
                  {motif === 'Autre' && (
                    <textarea className="form-input" rows={2} placeholder="Précisez le motif..."
                      value={motifCustom} onChange={e => setMotifCustom(e.target.value)} />
                  )}
                </div>

                {/* Récap montant */}
                {montantAvoir > 0 && (
                  <div style={{ background:'var(--blue1)', borderRadius:10, padding:'12px 16px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ color:'var(--blue4)', fontSize:13 }}>Montant de l'avoir</span>
                    <span style={{ fontFamily:'Sora', fontSize:20, fontWeight:700, color:'var(--blue4)' }}>{formatPrix(montantAvoir)}</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:12 }}>
              <button className="btn btn-outline" onClick={() => { setShowModal(false); resetForm() }}>Annuler</button>
              {cmdTrouvee && (
                <button className="btn btn-primary" onClick={handleCreerAvoir} disabled={saving || montantAvoir === 0}>
                  {saving ? '⏳ Création...' : '↩️ Créer l\'avoir'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL Traiter ──────────────────────────────────── */}
      {showTraiter && selectedAvoir && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:460 }}>
            <div className="modal-header">
              <span className="modal-title">✅ Traiter l'avoir</span>
              <button className="modal-close" onClick={() => setShowTraiter(false)}>✕</button>
            </div>

            <div style={{ background:'var(--warn)', border:'1px solid var(--warn2)', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'var(--amber4)' }}>
              ⚠️ Les produits retournés seront <strong>remis en stock rayon</strong> et le chiffre d'affaire sera ajusté.
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                <span style={{ color:'var(--t3)' }}>N° avoir</span>
                <span style={{ fontWeight:700, color:'var(--g4)' }}>{selectedAvoir.numero}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                <span style={{ color:'var(--t3)' }}>Client</span>
                <span>{selectedAvoir.client_nom || 'Client comptoir'}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}>
                <span style={{ color:'var(--t3)' }}>Motif</span>
                <span style={{ maxWidth:240, textAlign:'right' }}>{selectedAvoir.motif}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontWeight:700 }}>Montant à rembourser</span>
                <span style={{ fontFamily:'Sora', fontSize:20, fontWeight:700, color:'var(--g4)' }}>
                  {formatPrix(selectedAvoir.montant_total)}
                </span>
              </div>
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setShowTraiter(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleTraiter} disabled={saving}>
                {saving ? '⏳ Traitement...' : '✅ Confirmer le traitement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}