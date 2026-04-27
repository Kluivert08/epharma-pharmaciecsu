// ─── GestionSeuilPage.jsx — PATCH v2 ─────────────────────────
import React, { useEffect, useState, useContext } from 'react'
import { AuthContext } from '../App'
import {
  supabase,
  getSeuilMensuel,
  getDemandesSeuil,
  creerDemandeSeuil,
  validerDemandeSeuil,
} from '../lib/supabase'

// ── Cumul BC du mois en cours ─────────────────────────────────
async function getCumulMois() {
  const debut = new Date()
  debut.setDate(1); debut.setHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('bons_commande')
    .select('total_ht')
    .gte('created_at', debut.toISOString())
    .in('statut', ['brouillon', 'valide', 'envoye', 'recu'])
  return (data ?? []).reduce((s, b) => s + (b.total_ht || 0), 0)
}

// ── Helpers ───────────────────────────────────────────────────
function pct(val, max) {
  if (!max) return 0
  return Math.min(100, Math.round((val / max) * 100))
}

function barColor(p) {
  if (p >= 100) return 'var(--danger2)'
  if (p >= 80)  return '#E65100'
  if (p >= 60)  return '#F9A825'
  return 'var(--g4)'
}

const STATUT_CONFIG = {
  en_attente: { label: 'En attente',  color: '#E65100',        bg: 'rgba(230,81,0,.1)',   icon: '⏳' },
  approuve:   { label: 'Approuvée',   color: 'var(--g4)',      bg: 'var(--g1)',            icon: '✅' },
  refuse:     { label: 'Refusée',     color: 'var(--danger2)', bg: 'var(--danger)',        icon: '❌' },
}

// ─────────────────────────────────────────────────────────────
export default function GestionSeuilPage() {
  const { staff } = useContext(AuthContext)
  const role = staff?.role ?? ''
  const isAdmin     = role === 'superadmin' || role === 'admin'
  const isComptable = role === 'comptable' || isAdmin

  const [seuil,       setSeuil]       = useState(0)
  const [cumul,       setCumul]       = useState(0)
  const [demandes,    setDemandes]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [actionLoad,  setActionLoad]  = useState(null)
  const [formMontant, setFormMontant] = useState('')
  const [formMotif,   setFormMotif]   = useState('')
  const [formMsg,     setFormMsg]     = useState(null)
  const [submitLoad,  setSubmitLoad]  = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [s, c, d] = await Promise.all([
      getSeuilMensuel(),
      getCumulMois(),
      getDemandesSeuil(),
    ])
    setSeuil(s); setCumul(c); setDemandes(d)
    setLoading(false)
  }

  // ── Créer demande (comptable) ─────────────────────────────────
  async function handleDemande() {
    const montant = parseFloat(formMontant)
    if (!montant || montant <= 0) { setFormMsg({ type:'error', text:'Montant invalide.' }); return }
    if (!formMotif.trim())        { setFormMsg({ type:'error', text:'Le motif est obligatoire.' }); return }

    setSubmitLoad(true); setFormMsg(null)
    // PATCH v2 : montant = montant à AJOUTER au seuil actuel
    const { error } = await creerDemandeSeuil(montant, formMotif.trim(), staff.id)
    if (error) {
      setFormMsg({ type:'error', text: error.message })
    } else {
      setShowModal(false)
      setFormMontant(''); setFormMotif('')
      loadAll()
    }
    setSubmitLoad(false)
  }

  // ── Valider / Refuser (admin) ─────────────────────────────────
  async function handleValidation(demandeId, approuve) {
    setActionLoad(demandeId + (approuve ? '_ok' : '_no'))
    await validerDemandeSeuil(demandeId, approuve, staff.id)
    setActionLoad(null)
    loadAll()
  }

  const pourcentage = pct(cumul, seuil)
  const restant     = Math.max(0, seuil - cumul)
  const bloque      = cumul >= seuil
  const enAttenteCount = demandes.filter(d => d.statut === 'en_attente').length

  if (loading) return <div className="loader"><div className="spinner" /></div>

  return (
    <div>

      {/* ── KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:22 }}>
        {[
          {
            label: 'Seuil mensuel',
            value: `${seuil.toLocaleString('fr-FR')} F`,
            color: 'var(--g4)', icon: '🎯',
          },
          {
            label: 'Engagé ce mois',
            value: `${cumul.toLocaleString('fr-FR')} F`,
            color: bloque ? 'var(--danger2)' : pourcentage >= 80 ? '#E65100' : 'var(--t1)',
            icon: '🛒',
          },
          {
            label: 'Restant disponible',
            value: bloque ? '🔒 Bloqué' : `${restant.toLocaleString('fr-FR')} F`,
            color: bloque ? 'var(--danger2)' : pourcentage >= 80 ? '#E65100' : 'var(--g4)',
            icon: bloque ? '🚫' : '✅',
          },
          {
            label: 'Demandes en attente',
            value: enAttenteCount,
            color: enAttenteCount > 0 ? '#E65100' : 'var(--t3)',
            icon: '⏳',
          },
        ].map((s, i) => (
          <div key={i} className="stat-card fade-in">
            <div style={{ fontSize:22, marginBottom:4 }}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color:s.color, fontSize:18 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Barre de progression ── */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15 }}>Budget mensuel d'achat</div>
            <div style={{ fontSize:13, color:'var(--t3)', marginTop:2 }}>
              {cumul.toLocaleString('fr-FR')} FCFA engagés sur {seuil.toLocaleString('fr-FR')} FCFA autorisés
            </div>
          </div>
          <div style={{
            fontFamily:'Sora', fontSize:26, fontWeight:800,
            color: barColor(pourcentage),
          }}>
            {pourcentage}%
          </div>
        </div>

        {/* Barre */}
        <div style={{ height:18, borderRadius:9, background:'var(--border)', overflow:'hidden', marginBottom:8 }}>
          <div style={{
            height:'100%',
            width: `${pourcentage}%`,
            background: `linear-gradient(90deg, var(--g4), ${barColor(pourcentage)})`,
            borderRadius:9,
            transition:'width .4s ease',
            minWidth: cumul > 0 ? 8 : 0,
          }} />
        </div>

        {/* Légende */}
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--t3)' }}>
          <span>0</span>
          <span style={{ color:'#F9A825', fontWeight:600 }}>⚠️ 60% — {(seuil * 0.6).toLocaleString('fr-FR')} F</span>
          <span style={{ color:'#E65100', fontWeight:600 }}>🔶 80% — {(seuil * 0.8).toLocaleString('fr-FR')} F</span>
          <span style={{ color:'var(--danger2)', fontWeight:600 }}>🔒 100% — {seuil.toLocaleString('fr-FR')} F</span>
        </div>

        {/* Alerte si bloqué */}
        {bloque && (
          <div style={{ marginTop:14, padding:'10px 14px', background:'var(--danger)', borderRadius:10, display:'flex', alignItems:'center', gap:10, color:'var(--danger2)', fontWeight:600, fontSize:13 }}>
            <span style={{ fontSize:20 }}>🚫</span>
            Budget épuisé — La création de nouveaux bons de commande est <strong>bloquée</strong>. Un comptable doit soumettre une demande d'augmentation.
          </div>
        )}

        {!bloque && pourcentage >= 80 && (
          <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(230,81,0,.08)', borderRadius:10, display:'flex', alignItems:'center', gap:10, color:'#E65100', fontWeight:600, fontSize:13 }}>
            <span style={{ fontSize:20 }}>⚠️</span>
            Attention — Vous approchez du plafond mensuel. Anticiper une demande d'augmentation si nécessaire.
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h4 style={{ margin:0 }}>Historique des demandes de seuil</h4>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-outline btn-sm" onClick={loadAll}>🔄 Actualiser</button>
          {isComptable && (
            <button className="btn btn-primary btn-sm" onClick={() => { setShowModal(true); setFormMsg(null) }}>
              + Demande d'augmentation
            </button>
          )}
        </div>
      </div>

      {/* ── Tableau demandes ── */}
      <div className="card">
        {demandes.length === 0 ? (
          <div style={{ textAlign:'center', padding:50, color:'var(--t3)' }}>
            <div style={{ fontSize:40, marginBottom:10 }}>📋</div>
            <div>Aucune demande de seuil enregistrée</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Comptable</th>
                  <th>Seuil actuel</th>
                  <th>Montant demandé</th>
                  <th>Motif</th>
                  <th>Statut</th>
                  <th>Validé par</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {demandes.map(d => {
                  const cfg = STATUT_CONFIG[d.statut] || STATUT_CONFIG.en_attente
                  const isLoading_ok = actionLoad === d.id + '_ok'
                  const isLoading_no = actionLoad === d.id + '_no'
                  return (
                    <tr key={d.id}>
                      <td style={{ fontSize:12, color:'var(--t3)', whiteSpace:'nowrap' }}>
                        {new Date(d.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                      </td>
                      <td style={{ fontWeight:600 }}>
                        {d.comptable ? `${d.comptable.prenom} ${d.comptable.nom}` : '—'}
                      </td>
                      <td style={{ fontFamily:'Sora', fontSize:13, color:'var(--t2)' }}>
                        {(d.montant_actuel || 0).toLocaleString('fr-FR')} F
                      </td>
                      <td style={{ fontFamily:'Sora', fontSize:14, fontWeight:700, color:'var(--g4)' }}>
                        +{(d.montant_demande || 0).toLocaleString('fr-FR')} F
                        <div style={{ fontSize:11, color:'var(--t2)', fontWeight:400 }}>
                          → {((d.montant_actuel || 0) + (d.montant_demande || 0)).toLocaleString('fr-FR')} F
                        </div>
                      </td>
                      <td style={{ fontSize:13, color:'var(--t2)', maxWidth:200 }}>
                        {d.motif || '—'}
                      </td>
                      <td>
                        <span style={{
                          padding:'3px 10px', borderRadius:12, fontSize:11, fontWeight:700,
                          background: cfg.bg, color: cfg.color,
                          display:'inline-flex', alignItems:'center', gap:4,
                        }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td style={{ fontSize:12, color:'var(--t3)' }}>
                        {d.valideur
                          ? <>
                              <div style={{ fontWeight:600, color:'var(--t1)' }}>{d.valideur.prenom} {d.valideur.nom}</div>
                              {d.valide_at && <div style={{ fontSize:11 }}>{new Date(d.valide_at).toLocaleDateString('fr-FR')}</div>}
                            </>
                          : '—'
                        }
                      </td>
                      {isAdmin && (
                        <td>
                          {d.statut === 'en_attente' ? (
                            <div style={{ display:'flex', gap:6 }}>
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={!!actionLoad}
                                onClick={() => handleValidation(d.id, true)}>
                                {isLoading_ok ? '⏳' : '✅ Approuver'}
                              </button>
                              <button
                                className="btn btn-outline btn-sm"
                                style={{ color:'var(--danger2)', borderColor:'var(--danger2)' }}
                                disabled={!!actionLoad}
                                onClick={() => handleValidation(d.id, false)}>
                                {isLoading_no ? '⏳' : '❌ Refuser'}
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize:12, color:'var(--t3)' }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Info rôles ── */}
      <div style={{ marginTop:16, padding:'12px 16px', background:'var(--g1)', borderRadius:12, fontSize:12, color:'var(--t2)', display:'flex', gap:20, flexWrap:'wrap' }}>
        <span>🟢 <strong>Comptable</strong> : soumet les demandes d'augmentation</span>
        <span>🔵 <strong>Admin / Superadmin</strong> : approuve ou rejette les demandes</span>
        <span>🔴 <strong>Blocage auto</strong> : dès que cumul BC ≥ seuil, aucun nouveau BC ne peut être créé</span>
      </div>

      {/* ── Modal demande ── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth:480 }}>
            <div className="modal-header">
              <div className="modal-title">📤 Demande d'augmentation de seuil</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {formMsg && (
              <div className={`alert ${formMsg.type==='success'?'alert-success':'alert-error'}`} style={{ marginBottom:14 }}>
                {formMsg.text}
              </div>
            )}

            {/* Contexte */}
            <div style={{ padding:'12px 14px', background:'var(--g1)', borderRadius:10, marginBottom:16, fontSize:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ color:'var(--t3)' }}>Seuil actuel</span>
                <strong>{seuil.toLocaleString('fr-FR')} FCFA</strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ color:'var(--t3)' }}>Déjà engagé</span>
                <strong style={{ color: bloque ? 'var(--danger2)' : 'var(--t1)' }}>
                  {cumul.toLocaleString('fr-FR')} FCFA ({pourcentage}%)
                </strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'var(--t3)' }}>Restant</span>
                <strong style={{ color:'var(--g4)' }}>{restant.toLocaleString('fr-FR')} FCFA</strong>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom:14 }}>
              <label className="form-label">Montant à ajouter au seuil (FCFA) *</label>
              <input
                className="form-input"
                type="number"
                placeholder="Ex : 2000000"
                value={formMontant}
                onChange={e => setFormMontant(e.target.value)}
              />
              {formMontant && parseFloat(formMontant) > 0 && (
                <div style={{ fontSize:11, color:'var(--g4)', marginTop:4 }}>
                  Nouveau seuil si approuvé : <strong>{(seuil + parseFloat(formMontant)).toLocaleString('fr-FR')} FCFA</strong>
                  {' '}(actuel {seuil.toLocaleString('fr-FR')} + {parseFloat(formMontant).toLocaleString('fr-FR')})
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom:20 }}>
              <label className="form-label">Motif de la demande *</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Ex: Rupture urgente de médicaments vitaux — commande Laborex exceptionnelle"
                value={formMotif}
                onChange={e => setFormMotif(e.target.value)}
                style={{ resize:'vertical' }}
              />
            </div>

            <div style={{ padding:'10px 14px', background:'rgba(230,81,0,.08)', borderRadius:8, fontSize:12, color:'#E65100', marginBottom:16 }}>
              ⚠️ Cette demande sera transmise à l'administrateur. Si approuvée, le seuil sera augmenté du montant demandé.
            </div>

            <button className="btn btn-primary btn-lg" style={{ width:'100%' }}
              onClick={handleDemande} disabled={submitLoad}>
              {submitLoad ? '⏳ Envoi en cours...' : '📤 Soumettre la demande'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}