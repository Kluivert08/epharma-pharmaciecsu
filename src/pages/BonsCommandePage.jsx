// ─── BonsCommandePage.jsx — PATCH v2 ─────────────────────────
import React, { useEffect, useState, useContext } from 'react'
import { AuthContext } from '../App'
import {
  supabase,
  getBonsCommande, getFournisseurs, getProduits,
  creerBonCommande, validerBonCommande, envoyerBonCommande,
  verifierSeuilCommande,
  formatPrix, formatDate, logAudit,
} from '../lib/supabase'

function exportCSV(bons) {
  const headers = ['N° BC','Fournisseur','Gestionnaire','Total HT (FCFA)','Statut','Date création','Date réception']
  const rows = bons.map(b => [
    b.numero, b.fournisseurs?.nom || '',
    b.staff ? `${b.staff.prenom} ${b.staff.nom}` : '',
    b.total_ht, b.statut, formatDate(b.created_at), formatDate(b.recu_at),
  ])
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `bons_commande_${new Date().toISOString().slice(0,10)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

function imprimerBC(bon) {
  const lignesHTML = (bon.lignes || []).map(l => `
    <tr>
      <td>${l.produits?.emoji || '💊'} ${l.produits?.nom || '—'}</td>
      <td style="text-align:center">${l.quantite}</td>
      <td style="text-align:right">${Number(l.prix_unitaire).toLocaleString('fr-FR')} FCFA</td>
      <td style="text-align:right;font-weight:700">${Number(l.total_ligne).toLocaleString('fr-FR')} FCFA</td>
    </tr>`).join('')
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Bon de Commande ${bon.numero}</title>
  <style>
    body{font-family:'Segoe UI',sans-serif;margin:40px;color:#1a2e1a;font-size:13px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
    .logo-block{display:flex;align-items:center;gap:12px}
    .logo{width:48px;height:48px;background:#1B5E20;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px}
    h1{color:#1B5E20;font-size:20px;margin:0 0 4px}.meta{font-size:12px;color:#7A9E7A}
    .bc-info{background:#F0F7EE;border-radius:10px;padding:16px;margin-bottom:24px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .info-label{font-size:11px;font-weight:600;color:#7A9E7A;text-transform:uppercase;margin-bottom:2px}
    .info-value{font-size:14px;font-weight:600;color:#1a2e1a}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    th{background:#F0F7EE;padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#7A9E7A;text-transform:uppercase;border-bottom:2px solid #C8E6C0}
    td{padding:10px 12px;border-bottom:1px solid #E8F0E8}
    .total-row{background:#1B5E20;color:#fff;font-weight:700}.total-row td{border:none;padding:12px}
    .footer{margin-top:32px;padding-top:16px;border-top:1px solid #E8F0E8;font-size:11px;color:#7A9E7A;display:flex;justify-content:space-between}
    .signature{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
    .sig-box{border-top:1px solid #ccc;padding-top:8px;font-size:12px;color:#7A9E7A}
    @media print{body{margin:20px}}
  </style></head><body>
  <div class="header">
    <div class="logo-block"><div class="logo">✚</div>
      <div><h1>Bon de Commande</h1><div class="meta">Pharmacie CSU · Brazzaville</div></div></div>
    <div style="text-align:right">
      <div style="font-family:monospace;font-size:18px;font-weight:700;color:#1B5E20">${bon.numero}</div>
      <div class="meta">Émis le ${formatDate(bon.created_at)}</div>
      <div style="display:inline-block;margin-top:6px;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#E8F5E9;color:#1B5E20">
        ${{brouillon:'Brouillon',valide:'Validé',envoye:'Envoyé',livre:'Livré',recu:'Reçu',annule:'Annulé'}[bon.statut]||bon.statut}
      </div></div></div>
  <div class="bc-info">
    <div><div class="info-label">Fournisseur</div><div class="info-value">${bon.fournisseurs?.nom||'—'}</div></div>
    <div><div class="info-label">Gestionnaire</div><div class="info-value">${bon.staff?`${bon.staff.prenom} ${bon.staff.nom}`:'—'}</div></div>
    ${bon.fournisseurs?.telephone?`<div><div class="info-label">Tél. fournisseur</div><div class="info-value">${bon.fournisseurs.telephone}</div></div>`:''}
    ${bon.date_livraison?`<div><div class="info-label">Livraison souhaitée</div><div class="info-value">${formatDate(bon.date_livraison)}</div></div>`:''}
    ${bon.notes?`<div style="grid-column:1/-1"><div class="info-label">Notes</div><div class="info-value">${bon.notes}</div></div>`:''}
  </div>
  <table><thead><tr><th>Produit</th><th style="text-align:center">Qté</th><th style="text-align:right">Prix unit.</th><th style="text-align:right">Total</th></tr></thead>
  <tbody>${lignesHTML}</tbody>
  <tfoot><tr class="total-row"><td colspan="3">TOTAL HT</td><td style="text-align:right">${Number(bon.total_ht).toLocaleString('fr-FR')} FCFA</td></tr></tfoot></table>
  <div class="signature"><div class="sig-box">Signature gestionnaire de stock</div><div class="sig-box">Cachet & signature fournisseur</div></div>
  <div class="footer"><span>ePharma — Pharmacie CSU</span><span>Généré le ${new Date().toLocaleString('fr-FR')}</span></div>
  </body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
  window.open(URL.createObjectURL(blob), '_blank')
}

// ── Badge + Pipeline 5 étapes ─────────────────────────────────
const STATUTS = {
  brouillon: { cls:'badge-gray',  label:'📝 Brouillon' },
  valide:    { cls:'badge-blue',  label:'✅ Validé'    },
  envoye:    { cls:'badge-amber', label:'📤 Envoyé'    },
  livre:     { cls:'badge-blue',  label:'🚚 Livré'     },
  recu:      { cls:'badge-green', label:'📦 Reçu'      },
  annule:    { cls:'badge-red',   label:'✕ Annulé'    },
}
function BadgeStatut({ statut }) {
  const s = STATUTS[statut] ?? { cls:'badge-gray', label: statut }
  return <span className={`badge ${s.cls}`}>{s.label}</span>
}

const PIPELINE        = ['brouillon','valide','envoye','livre','recu']
const PIPELINE_LABELS = ['Brouillon','Validé','Envoyé','Livré','Reçu Magasin']
const PIPELINE_ICONS  = ['📝','✅','📤','🚚','📦']

function Pipeline({ statut }) {
  const idx = PIPELINE.indexOf(statut)
  return (
    <div style={{ display:'flex', alignItems:'center', marginBottom:24 }}>
      {PIPELINE.map((s, i) => {
        const done   = i < idx
        const active = i === idx
        return (
          <React.Fragment key={s}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{
                width:32, height:32, borderRadius:'50%',
                display:'flex', alignItems:'center', justifyContent:'center',
                background: done ? 'var(--g4)' : active ? 'var(--g3)' : 'var(--border)',
                color: (done||active) ? '#fff' : 'var(--t3)',
                fontSize: done ? 13 : 15, fontWeight:700,
                boxShadow: active ? '0 0 0 4px rgba(76,175,80,.2)' : 'none',
                transition: 'all .2s',
              }}>
                {done ? '✓' : PIPELINE_ICONS[i]}
              </div>
              <div style={{ fontSize:10, fontWeight: active?700:400, color: (active||done)?'var(--g4)':'var(--t3)', whiteSpace:'nowrap' }}>
                {PIPELINE_LABELS[i]}
              </div>
            </div>
            {i < PIPELINE.length - 1 && (
              <div style={{ flex:1, height:2, margin:'0 4px', marginBottom:20, background: i < idx ? 'var(--g4)' : 'var(--border)', transition:'background .3s' }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
export default function BonsCommandePage() {
  const { staff } = useContext(AuthContext)

  const [bons,         setBons]         = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [produits,     setProduits]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [showBL,     setShowBL]     = useState(false)
  const [selected,   setSelected]   = useState(null)

  const [search,       setSearch]       = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreFourn,  setFiltreFourn]  = useState('')

  const [fournisseurId, setFournisseurId] = useState('')
  const [notes,         setNotes]         = useState('')
  const [dateLivraison, setDateLivraison] = useState('')
  const [lignes,        setLignes]        = useState([{ produit_id:'', nom:'', quantite:1, prix_unitaire:0 }])
  const [seuilInfo,     setSeuilInfo]     = useState(null)
  const [seuilChecked,  setSeuilChecked]  = useState(false)

  const [blForm, setBlForm] = useState({ num_bl:'', date_livraison:'', agent_nom:'', agent_tel:'', observations:'' })
  const [blMsg,  setBlMsg]  = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [b, f, p] = await Promise.all([getBonsCommande(), getFournisseurs(), getProduits()])
    setBons(b); setFournisseurs(f); setProduits(p)
    setLoading(false)
  }

  // ── Recharge un BC depuis Supabase et met à jour selected + liste ──
  async function rechargerBC(id) {
    const { data } = await supabase
      .from('bons_commande')
      .select('*, fournisseurs(nom, telephone), staff:gestionnaire_id(nom, prenom), lignes:bons_commande_lignes(*, produits(nom, emoji))')
      .eq('id', id).single()
    if (data) {
      setSelected(data)
      setBons(prev => prev.map(b => b.id === id ? data : b))
    }
  }

  function addLigne() { setLignes([...lignes, { produit_id:'', nom:'', quantite:1, prix_unitaire:0 }]); setSeuilChecked(false); setSeuilInfo(null) }
  function removeLigne(i) { setLignes(lignes.filter((_,j) => j!==i)); setSeuilChecked(false) }
  function updateLigne(i, field, val) {
    const next = [...lignes]; next[i] = { ...next[i], [field]: val }
    if (field === 'produit_id') {
      const p = produits.find(x => x.id === val)
      if (p) { next[i].nom = p.nom; next[i].prix_unitaire = p.prix_achat || 0 }
    }
    setLignes(next); setSeuilChecked(false); setSeuilInfo(null)
  }
  const totalHT = lignes.reduce((s,l) => s + Number(l.quantite||0) * Number(l.prix_unitaire||0), 0)

  async function verifierSeuil() {
    const { data } = await verifierSeuilCommande(totalHT)
    setSeuilInfo(data); setSeuilChecked(true)
  }

  async function handleCreer(e) {
    e.preventDefault()
    if (!fournisseurId) return
    if (!seuilChecked) { await verifierSeuil(); return }
    if (seuilInfo && !seuilInfo.ok) return
    setSaving(true)
    try {
      const lignesData = lignes.map(l => ({ produit_id: l.produit_id||null, quantite: parseInt(l.quantite), prix_unitaire: parseFloat(l.prix_unitaire) }))
      const bc = await creerBonCommande(fournisseurId, staff.id, lignesData, notes)
      if (dateLivraison) await supabase.from('bons_commande').update({ date_livraison: dateLivraison }).eq('id', bc.id)
      await logAudit({ staffId: staff.id, action: 'create_bc', tableName: 'bons_commande', recordId: bc.id, details: bc.numero })
      setShowCreate(false); resetCreate(); await load()
    } catch (err) { alert('Erreur : ' + err.message) }
    setSaving(false)
  }
  function resetCreate() {
    setFournisseurId(''); setNotes(''); setDateLivraison('')
    setLignes([{ produit_id:'', nom:'', quantite:1, prix_unitaire:0 }])
    setSeuilInfo(null); setSeuilChecked(false)
  }

  async function handleValider(bon) {
    await validerBonCommande(bon.id)
    await logAudit({ staffId: staff.id, action: 'valider_bc', tableName: 'bons_commande', recordId: bon.id })
    await load(); if (showDetail) await rechargerBC(bon.id)
  }
  async function handleEnvoyer(bon) {
    await envoyerBonCommande(bon.id)
    await logAudit({ staffId: staff.id, action: 'envoyer_bc', tableName: 'bons_commande', recordId: bon.id })
    await load(); if (showDetail) await rechargerBC(bon.id)
  }

  function ouvrirBL(bon) {
    setSelected(bon)
    setBlForm({ num_bl:'', date_livraison: new Date().toISOString().slice(0,10), agent_nom:'', agent_tel:'', observations:'' })
    setBlMsg(null); setShowBL(true)
  }

  async function handleEnregistrerBL() {
    if (!blForm.num_bl.trim())    { setBlMsg({ type:'error', text:'N° du bon de livraison obligatoire.' }); return }
    if (!blForm.date_livraison)   { setBlMsg({ type:'error', text:'Date de livraison obligatoire.' }); return }
    if (!blForm.agent_nom.trim()) { setBlMsg({ type:'error', text:'Nom du livreur obligatoire.' }); return }
    setSaving(true); setBlMsg(null)
    try {
      const { error } = await supabase.from('bons_commande').update({
        statut: 'livre', livre_at: new Date().toISOString(),
        num_bl: blForm.num_bl.trim(), agent_nom: blForm.agent_nom.trim(),
        agent_tel: blForm.agent_tel.trim()||null, bl_observations: blForm.observations.trim()||null,
      }).eq('id', selected.id)
      if (error) throw error
      await logAudit({ staffId: staff.id, action: 'livraison_bc', tableName: 'bons_commande', recordId: selected.id, details: `BL ${blForm.num_bl} — ${blForm.agent_nom}` })
      setShowBL(false)
      // ① Recharger le BC → pipeline passe automatiquement à l'étape 4 "Livré"
      await rechargerBC(selected.id)
      // ② Sync liste
      await load()
    } catch (err) { setBlMsg({ type:'error', text: err.message }) }
    setSaving(false)
  }

  const liste = bons.filter(b => {
    if (filtreStatut && b.statut !== filtreStatut) return false
    if (filtreFourn  && b.fournisseur_id !== filtreFourn) return false
    if (search) { const q = search.toLowerCase(); if (!b.numero?.toLowerCase().includes(q) && !b.fournisseurs?.nom?.toLowerCase().includes(q)) return false }
    return true
  })
  const totalListe = liste.reduce((s,b) => s + Number(b.total_ht||0), 0)

  if (loading) return <div className="loader"><div className="spinner" /></div>

  return (
    <div className="fade-in">

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 style={{ margin:0 }}>📋 Bons de Commande</h2>
          <div style={{ color:'var(--t3)', fontSize:13, marginTop:2 }}>{bons.length} bon(s) enregistré(s)</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => exportCSV(liste)}>⬇ CSV</button>
          <button className="btn btn-primary" onClick={() => { resetCreate(); setShowCreate(true) }}>+ Nouveau BC</button>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom:20 }}>
        {[
          { label:'Total BC',      value: liste.length, icon:'📋', color:'var(--t1)' },
          { label:'En cours',      value: liste.filter(b => ['brouillon','valide','envoye'].includes(b.statut)).length, icon:'⏳', color:'var(--warn2)' },
          { label:'Livrés',        value: liste.filter(b => b.statut==='livre').length, icon:'🚚', color:'var(--blue4)' },
          { label:'Reçus Magasin', value: liste.filter(b => b.statut==='recu').length, icon:'📦', color:'var(--g4)' },
        ].map(k => (
          <div key={k.label} className="stat-card">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div className="stat-label">{k.label}</div>
              <span style={{ fontSize:22 }}>{k.icon}</span>
            </div>
            <div className="stat-value" style={{ color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom:16, display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div style={{ flex:2, minWidth:180 }}>
          <div className="form-label">Recherche</div>
          <input className="form-input" placeholder="N° BC, fournisseur..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ minWidth:160 }}>
          <div className="form-label">Statut</div>
          <select className="form-input form-select" value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}>
            <option value="">Tous</option>
            {Object.entries(STATUTS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div style={{ minWidth:180 }}>
          <div className="form-label">Fournisseur</div>
          <select className="form-input form-select" value={filtreFourn} onChange={e => setFiltreFourn(e.target.value)}>
            <option value="">Tous</option>
            {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </div>
        {(search||filtreStatut||filtreFourn) && (
          <button className="btn btn-outline btn-sm" style={{ alignSelf:'flex-end' }}
            onClick={() => { setSearch(''); setFiltreStatut(''); setFiltreFourn('') }}>✕ Réinitialiser</button>
        )}
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>N° BC</th><th>Fournisseur</th><th>Gestionnaire</th><th>Lignes</th><th>Total HT</th><th>Date</th><th>Statut</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {liste.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign:'center', padding:48, color:'var(--t3)' }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>📋</div>
                  Aucun bon de commande{search||filtreStatut?' pour ces filtres':''}
                </td></tr>
              ) : liste.map(b => (
                <tr key={b.id}>
                  <td style={{ fontFamily:'Sora', fontWeight:700, color:'var(--g4)' }}>{b.numero}</td>
                  <td style={{ fontWeight:600 }}>{b.fournisseurs?.nom||'—'}</td>
                  <td style={{ fontSize:12, color:'var(--t3)' }}>{b.staff?`${b.staff.prenom} ${b.staff.nom}`:'—'}</td>
                  <td style={{ fontSize:12 }}>{b.lignes?.length||0} produit(s)</td>
                  <td style={{ fontFamily:'Sora', fontWeight:700, color:'var(--g4)', whiteSpace:'nowrap' }}>{formatPrix(b.total_ht)}</td>
                  <td style={{ fontSize:12, color:'var(--t3)' }}>{formatDate(b.created_at)}</td>
                  <td><BadgeStatut statut={b.statut} /></td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn-icon" style={{ fontSize:14, padding:6 }} onClick={() => { setSelected(b); setShowDetail(true) }} title="Voir">👁</button>
                      <button className="btn-icon" style={{ fontSize:14, padding:6 }} onClick={() => imprimerBC(b)} title="Imprimer">🖨</button>
                      {b.statut==='brouillon' && <button className="btn btn-primary btn-sm" onClick={() => handleValider(b)}>✅ Valider</button>}
                      {b.statut==='valide'    && <button className="btn btn-primary btn-sm" onClick={() => handleEnvoyer(b)}>📤 Envoyer</button>}
                      {b.statut==='envoye'    && <button className="btn btn-primary btn-sm" onClick={() => ouvrirBL(b)}>🚚 Bon de Livraison</button>}
                      {b.statut==='livre'     && <span style={{ fontSize:11, color:'var(--blue4)', fontWeight:600 }}>⏳ Att. Magasinier</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {liste.length > 0 && (
          <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', gap:24, fontSize:13, color:'var(--t3)' }}>
            <span>{liste.length} bon(s)</span>
            <span style={{ fontWeight:700, color:'var(--g4)' }}>Total : {formatPrix(totalListe)}</span>
          </div>
        )}
      </div>

      {/* ── MODAL Créer BC ──────────────────────────────────── */}
      {showCreate && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:700, maxHeight:'90vh', overflowY:'auto' }}>
            <div className="modal-header">
              <span className="modal-title">📋 Nouveau bon de commande</span>
              <button className="modal-close" onClick={() => { setShowCreate(false); resetCreate() }}>✕</button>
            </div>
            <form onSubmit={handleCreer}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                <div className="form-group" style={{ margin:0 }}>
                  <label className="form-label">Fournisseur <span style={{ color:'var(--danger2)' }}>*</span></label>
                  <select className="form-input form-select" required value={fournisseurId} onChange={e => setFournisseurId(e.target.value)}>
                    <option value="">-- Choisir --</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin:0 }}>
                  <label className="form-label">Livraison souhaitée</label>
                  <input className="form-input" type="date" value={dateLivraison} onChange={e => setDateLivraison(e.target.value)} />
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <div className="form-label" style={{ margin:0 }}>Produits à commander</div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={addLigne}>+ Ligne</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 80px 120px 30px', gap:6, marginBottom:4 }}>
                  {['Produit','Qté','Prix unit. (FCFA)',''].map(h => (
                    <div key={h} style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em' }}>{h}</div>
                  ))}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {lignes.map((l,i) => (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 80px 120px 30px', gap:6, alignItems:'center' }}>
                      <select className="form-input form-select" value={l.produit_id} onChange={e => updateLigne(i,'produit_id',e.target.value)}>
                        <option value="">-- Produit --</option>
                        {produits.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.nom}</option>)}
                      </select>
                      <input className="form-input" type="number" min="1" value={l.quantite} onChange={e => updateLigne(i,'quantite',e.target.value)} />
                      <input className="form-input" type="number" min="0" value={l.prix_unitaire} onChange={e => updateLigne(i,'prix_unitaire',e.target.value)} />
                      <button type="button" onClick={() => removeLigne(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--danger2)', fontSize:16 }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--g1)', borderRadius:10, padding:'12px 16px', marginBottom:14 }}>
                <span style={{ fontWeight:600, color:'var(--t2)' }}>Total HT</span>
                <span style={{ fontFamily:'Sora', fontSize:22, fontWeight:700, color:'var(--g4)' }}>{formatPrix(totalHT)}</span>
              </div>
              {seuilInfo && (
                <div style={{ padding:'12px 16px', borderRadius:10, marginBottom:14, background: seuilInfo.ok?'var(--g1)':'var(--danger)', border:`1px solid ${seuilInfo.ok?'var(--g2)':'#FFCDD2'}`, color: seuilInfo.ok?'var(--g5)':'var(--danger2)' }}>
                  <div style={{ fontWeight:700, marginBottom:6 }}>{seuilInfo.ok?'✅ Seuil respecté':'⛔ Seuil mensuel dépassé — Réduisez les quantités'}</div>
                  <div style={{ fontSize:12, display:'flex', gap:24 }}>
                    <span>Seuil : <strong>{formatPrix(seuilInfo.seuil)}</strong></span>
                    <span>Dépensé ce mois : <strong>{formatPrix(seuilInfo.depense_mois)}</strong></span>
                    <span>Reste : <strong>{formatPrix(seuilInfo.reste)}</strong></span>
                  </div>
                </div>
              )}
              <div className="form-group" style={{ marginBottom:14 }}>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instructions spéciales..." />
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button type="button" className="btn btn-outline" onClick={() => { setShowCreate(false); resetCreate() }}>Annuler</button>
                <button type="button" className="btn btn-outline" onClick={verifierSeuil}>🎯 Vérifier seuil</button>
                <button type="submit" className="btn btn-primary" disabled={saving||(seuilChecked&&seuilInfo&&!seuilInfo.ok)}>
                  {saving?'⏳...':seuilChecked?'📋 Créer le BC':'🎯 Vérifier et créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL Détail BC ─────────────────────────────────── */}
      {showDetail && selected && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:660 }}>
            <div className="modal-header">
              <span className="modal-title">📋 {selected.numero}</span>
              <button className="modal-close" onClick={() => setShowDetail(false)}>✕</button>
            </div>

            {/* Pipeline dynamique — se met à jour immédiatement après enregistrement BL */}
            <Pipeline statut={selected.statut} />

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              {[
                { label:'Fournisseur',        value: selected.fournisseurs?.nom },
                { label:'Gestionnaire',        value: selected.staff?`${selected.staff.prenom} ${selected.staff.nom}`:'—' },
                { label:'Date création',       value: formatDate(selected.created_at) },
                { label:'Livraison souhaitée', value: formatDate(selected.date_livraison)||'—' },
              ].map(item => (
                <div key={item.label} style={{ background:'var(--g1)', borderRadius:9, padding:'10px 14px' }}>
                  <div style={{ fontSize:11, color:'var(--t3)', fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>{item.label}</div>
                  <div style={{ fontWeight:600 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Bloc BL — affiché dès que statut = livre ou recu */}
            {['livre','recu'].includes(selected.statut) && selected.num_bl && (
              <div style={{ background:'rgba(21,101,192,.06)', borderRadius:10, padding:'12px 16px', marginBottom:16, border:'1px solid rgba(21,101,192,.15)' }}>
                <div style={{ fontWeight:700, color:'var(--blue4)', marginBottom:8, fontSize:13 }}>🚚 Bon de Livraison enregistré</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, fontSize:12 }}>
                  <div><div style={{ color:'var(--t3)', fontSize:11 }}>N° BL</div><strong style={{ fontFamily:'monospace' }}>{selected.num_bl}</strong></div>
                  <div><div style={{ color:'var(--t3)', fontSize:11 }}>Livreur</div><strong>{selected.agent_nom}</strong></div>
                  <div><div style={{ color:'var(--t3)', fontSize:11 }}>Tél</div><strong>{selected.agent_tel||'—'}</strong></div>
                </div>
                {selected.bl_observations && <div style={{ marginTop:8, fontSize:12, color:'var(--t2)' }}>📝 {selected.bl_observations}</div>}
              </div>
            )}

            <div className="table-wrap" style={{ marginBottom:14 }}>
              <table>
                <thead><tr><th>Produit</th><th>Qté</th><th>Prix unit.</th><th>Total</th></tr></thead>
                <tbody>
                  {(selected.lignes||[]).map(l => (
                    <tr key={l.id}>
                      <td>{l.produits?.emoji} {l.produits?.nom||'—'}</td>
                      <td>{l.quantite}</td>
                      <td>{formatPrix(l.prix_unitaire)}</td>
                      <td style={{ fontWeight:700, color:'var(--g4)' }}>{formatPrix(l.total_ligne)}</td>
                    </tr>
                  ))}
                  <tr style={{ background:'var(--g1)' }}>
                    <td colSpan={3} style={{ fontWeight:700, textAlign:'right' }}>Total HT</td>
                    <td style={{ fontFamily:'Sora', fontWeight:700, color:'var(--g4)', fontSize:16 }}>{formatPrix(selected.total_ht)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {selected.notes && (
              <div style={{ background:'var(--g1)', borderRadius:9, padding:'10px 14px', fontSize:13, marginBottom:14, color:'var(--t2)' }}>📝 {selected.notes}</div>
            )}

            {/* Bandeau d'info quand statut = livre : en attente Magasinier */}
            {selected.statut === 'livre' && (
              <div style={{ background:'var(--blue1)', border:'1px solid rgba(21,101,192,.2)', borderRadius:10, padding:'12px 16px', marginBottom:14, fontSize:13, color:'var(--blue4)', display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:20 }}>⏳</span>
                <div>
                  <div style={{ fontWeight:700 }}>En attente de réception par le Magasinier</div>
                  <div style={{ fontSize:12, marginTop:2 }}>Le BL est enregistré. Le Magasinier réceptionne les produits dans son onglet « Réceptionner ».</div>
                </div>
              </div>
            )}

            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button className="btn btn-outline" onClick={() => imprimerBC(selected)}>🖨 Imprimer</button>
              {selected.statut==='brouillon' && <button className="btn btn-primary" onClick={() => handleValider(selected)}>✅ Valider</button>}
              {selected.statut==='valide'    && <button className="btn btn-primary" onClick={() => handleEnvoyer(selected)}>📤 Envoyer</button>}
              {selected.statut==='envoye'    && <button className="btn btn-primary" onClick={() => { setShowDetail(false); ouvrirBL(selected) }}>🚚 Bon de Livraison</button>}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL Bon de Livraison ──────────────────────────── */}
      {showBL && selected && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:520 }}>
            <div className="modal-header">
              <span className="modal-title">🚚 Enregistrer la livraison — {selected.numero}</span>
              <button className="modal-close" onClick={() => setShowBL(false)}>✕</button>
            </div>
            <div style={{ background:'var(--g1)', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ color:'var(--t3)' }}>Fournisseur</span><strong>{selected.fournisseurs?.nom}</strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ color:'var(--t3)' }}>Produits commandés</span><strong>{selected.lignes?.length||0} référence(s)</strong>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ color:'var(--t3)' }}>Montant HT</span><strong style={{ color:'var(--g4)' }}>{formatPrix(selected.total_ht)}</strong>
              </div>
            </div>
            {blMsg && <div className={`alert ${blMsg.type==='success'?'alert-success':'alert-error'}`} style={{ marginBottom:14 }}>{blMsg.text}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">N° Bon de Livraison <span style={{ color:'var(--danger2)' }}>*</span></label>
                <input className="form-input" placeholder="BL-2025-XXXX" value={blForm.num_bl} onChange={e => setBlForm({...blForm,num_bl:e.target.value})} />
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Date de livraison <span style={{ color:'var(--danger2)' }}>*</span></label>
                <input className="form-input" type="date" value={blForm.date_livraison} onChange={e => setBlForm({...blForm,date_livraison:e.target.value})} />
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Nom de l'agent livreur <span style={{ color:'var(--danger2)' }}>*</span></label>
                <input className="form-input" placeholder="Jean Mbemba" value={blForm.agent_nom} onChange={e => setBlForm({...blForm,agent_nom:e.target.value})} />
              </div>
              <div className="form-group" style={{ margin:0 }}>
                <label className="form-label">Téléphone livreur</label>
                <input className="form-input" placeholder="+242 06 XXX XX XX" value={blForm.agent_tel} onChange={e => setBlForm({...blForm,agent_tel:e.target.value})} />
              </div>
              <div className="form-group" style={{ margin:0, gridColumn:'1/-1' }}>
                <label className="form-label">Observations / Réserves</label>
                <textarea className="form-input" rows={2} placeholder="Ex: 3 cartons endommagés..." value={blForm.observations} onChange={e => setBlForm({...blForm,observations:e.target.value})} />
              </div>
            </div>
            <div style={{ padding:'10px 14px', background:'rgba(21,101,192,.06)', borderRadius:8, fontSize:12, color:'var(--blue4)', marginBottom:16 }}>
              ℹ️ Une fois confirmé, le BC passe en <strong>« Livré »</strong>. Le Magasinier réceptionne ensuite les produits en réserve.
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button className="btn btn-outline" onClick={() => setShowBL(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleEnregistrerBL} disabled={saving}>
                {saving?'⏳ Enregistrement...':'🚚 Confirmer la livraison'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}