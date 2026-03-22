import React, { useEffect, useState, useContext } from 'react'
//import { supabase } from '../lib/supabase'
import { AuthContext } from '../App'
import {
  getProduits, getCategories, getStockAlertes, getStockMovements,
  ajusterStock, createProduit, getVentes, getEcritures, addEcriture,
  getAllStaff, createStaff, updateStaff, supabase,
} from '../lib/supabase'

// ── Utilitaires export ────────────────────────────────────────
function exportCSV(headers, rows, filename) {
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function exportRapportHTML(title, subtitle, stats, tableHeaders, tableRows, footer) {
  const statsHTML = stats.map(s => `
    <div class="stat">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value" style="color:${s.color||'#2E7D32'}">${s.value}</div>
    </div>`).join('')

  const rowsHTML = tableRows.map(r => `
    <tr>${r.map((cell, i) => `<td style="${cell.style||''}">${cell.html||cell.value||cell}</td>`).join('')}</tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; margin: 40px; color: #1a2e1a; }
    .header { display:flex; align-items:center; gap:16px; margin-bottom:8px; }
    .logo { width:48px; height:48px; background:#1B5E20; border-radius:14px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:24px; }
    h1 { color:#1B5E20; font-size:22px; margin:0; }
    .subtitle { color:#7A9E7A; font-size:13px; margin-bottom:28px; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:16px; margin-bottom:28px; }
    .stat { background:#F0F7EE; border-radius:10px; padding:14px; }
    .stat-label { font-size:11px; font-weight:600; color:#7A9E7A; text-transform:uppercase; margin-bottom:4px; }
    .stat-value { font-size:22px; font-weight:700; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th { background:#F0F7EE; padding:10px 12px; text-align:left; font-size:11px; font-weight:600; color:#7A9E7A; text-transform:uppercase; border-bottom:2px solid #C8E6C0; }
    td { padding:10px 12px; border-bottom:1px solid #E8F0E8; }
    tr:hover td { background:#F9FDF9; }
    .footer { margin-top:28px; font-size:11px; color:#7A9E7A; text-align:center; border-top:1px solid #E8F0E8; padding-top:12px; }
    @media print { body { margin:20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">✚</div>
    <div>
      <h1>${title}</h1>
      <div class="subtitle">${subtitle} · Généré le ${new Date().toLocaleString('fr-FR')}</div>
    </div>
  </div>
  <div class="stats">${statsHTML}</div>
  <table>
    <thead><tr>${tableHeaders.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div class="footer">${footer}</div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
  window.open(URL.createObjectURL(blob), '_blank')
}

// ── VENTES PAGE ───────────────────────────────────────────────
// ── Remplacez toute la fonction VentesPage dans StockPage.jsx ────────────────

export function VentesPage() {
  const { staff } = useContext(AuthContext)
  const [ventes,    setVentes]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(null)
  const [filtre,    setFiltre]    = useState('jour')
  const [dateJour,  setDateJour]  = useState(new Date().toISOString().slice(0, 10))
  const [dateMois,  setDateMois]  = useState(new Date().toISOString().slice(0, 7))
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin,   setDateFin]   = useState('')

  useEffect(() => { loadData() }, [filtre, dateJour, dateMois, dateDebut, dateFin])

  async function loadData() {
    setLoading(true)

    let q = supabase
      .from('commandes_pos')
      .select(`
        id,
        numero,
        statut,
        total,
        sous_total,
        remise_montant,
        montant_assurance,
        montant_patient,
        mode_paiement,
        ref_paiement,
        client_nom,
        client_tel,
        nom_assure,
        numero_assure,
        taux_couverture,
        created_at,
        vendeuse:vendeuse_id ( id, nom, prenom ),
        caissiere:caissiere_id ( id, nom, prenom ),
        assurance:assurance_id ( nom ),
        service:service_id ( nom_service, taux_couverture ),
        commandes_pos_lignes (
          quantite,
          prix_unitaire,
          total_ligne,
          remise_pct,
          produits ( nom, emoji, conditionnement )
        )
      `)
      .eq('statut', 'payee')
      .order('created_at', { ascending: false })
      .limit(500)

    if (filtre === 'jour') {
      q = q.gte('created_at', `${dateJour}T00:00:00`).lte('created_at', `${dateJour}T23:59:59`)
    } else if (filtre === 'mois') {
      const [y, m] = dateMois.split('-')
      q = q.gte('created_at', `${dateMois}-01T00:00:00`).lte('created_at', `${y}-${m}-31T23:59:59`)
    } else if (dateDebut && dateFin) {
      q = q.gte('created_at', `${dateDebut}T00:00:00`).lte('created_at', `${dateFin}T23:59:59`)
    }

    const { data, error } = await q
    if (error) console.error('Ventes error:', error)
    setVentes(data ?? [])
    setLoading(false)
  }

  function getPeriodeLabel() {
    if (filtre === 'jour')    return `Journée du ${new Date(dateJour).toLocaleDateString('fr-FR')}`
    if (filtre === 'mois')    return `Mois de ${new Date(dateMois + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`
    if (dateDebut && dateFin) return `Du ${new Date(dateDebut).toLocaleDateString('fr-FR')} au ${new Date(dateFin).toLocaleDateString('fr-FR')}`
    return 'Période'
  }

  const totalCA    = ventes.reduce((s, v) => s + v.total, 0)
  const totalMTN   = ventes.filter(v => v.mode_paiement === 'mtn_momo').reduce((s, v) => s + v.total, 0)
  const totalAir   = ventes.filter(v => v.mode_paiement === 'airtel_money').reduce((s, v) => s + v.total, 0)
  const totalVis   = ventes.filter(v => v.mode_paiement === 'visa').reduce((s, v) => s + v.total, 0)
  const totalEsp   = ventes.filter(v => v.mode_paiement === 'especes').reduce((s, v) => s + v.total, 0)
  const totalAssur = ventes.reduce((s, v) => s + (v.montant_assurance || 0), 0)

  function handleExportCSV() {
    const headers = [
      'Date', 'N° Commande', 'Vendeuse', 'Caissière',
      'Client', 'Téléphone', 'Assuré', 'N° Assuré', 'Assurance', 'Service', 'Taux%',
      'Articles', 'Produits', 'Sous-total FCFA', 'Remise FCFA',
      'Part assurance FCFA', 'Part patient FCFA', 'Total FCFA',
      'Mode paiement', 'Réf. paiement',
    ]
    const rows = ventes.map(v => [
      new Date(v.created_at).toLocaleString('fr-FR'),
      v.numero,
      v.vendeuse ? `${v.vendeuse.prenom} ${v.vendeuse.nom}` : '—',
      v.caissiere ? `${v.caissiere.prenom} ${v.caissiere.nom}` : '—',
      v.client_nom || '—',
      v.client_tel || '—',
      v.nom_assure || '—',
      v.numero_assure || '—',
      v.assurance?.nom || '—',
      v.service?.nom_service || '—',
      v.taux_couverture || 0,
      v.commandes_pos_lignes?.length || 0,
      v.commandes_pos_lignes?.map(l => `${l.produits?.nom} x${l.quantite}`).join(' | ') || '—',
      v.sous_total || 0,
      v.remise_montant || 0,
      v.montant_assurance || 0,
      v.montant_patient || v.total,
      v.total,
      v.mode_paiement?.replace('_', ' ').toUpperCase() || '',
      v.ref_paiement || '—',
    ])
    exportCSV(headers, rows, `ventes-${filtre}-${Date.now()}.csv`)
  }

  function handleExportRapport() {
    exportRapportHTML(
      `Rapport des ventes — ${getPeriodeLabel()}`,
      `Pharmacie CSU · ${ventes.length} vente(s)`,
      [
        { label: 'CA Total',          value: `${totalCA.toLocaleString('fr-FR')} F` },
        { label: 'MTN MoMo',          value: `${totalMTN.toLocaleString('fr-FR')} F`,  color: '#E65100' },
        { label: 'Airtel Money',       value: `${totalAir.toLocaleString('fr-FR')} F`,  color: '#C62828' },
        { label: 'Carte Visa',         value: `${totalVis.toLocaleString('fr-FR')} F`,  color: '#1565C0' },
        { label: 'Espèces',            value: `${totalEsp.toLocaleString('fr-FR')} F`,  color: '#2E7D32' },
        { label: 'Part assurances',    value: `${totalAssur.toLocaleString('fr-FR')} F`, color: '#6A1B9A' },
      ],
      ['Date', 'N° Cmd', 'Vendeuse', 'Caissière', 'Client', 'Assurance', 'Articles', 'Total', 'Paiement'],
      ventes.map(v => [
        new Date(v.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }),
        v.numero,
        v.vendeuse ? `${v.vendeuse.prenom} ${v.vendeuse.nom}` : '—',
        v.caissiere ? `${v.caissiere.prenom} ${v.caissiere.nom}` : '—',
        v.client_nom || '—',
        v.assurance?.nom ? `${v.assurance.nom} ${v.taux_couverture}%` : '—',
        `${v.commandes_pos_lignes?.length || 0} art.`,
        { value: `${v.total?.toLocaleString('fr-FR')} F`, style:'font-weight:700;color:#2E7D32' },
        { html: `<span style="background:#E3F2FD;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${v.mode_paiement?.replace('_',' ').toUpperCase()||''}</span>` },
      ]),
      `ePharma · Exporté par ${staff?.prenom} ${staff?.nom} · ${ventes.length} vente(s)`
    )
  }

  return (
    <div>
      {/* Filtres */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div>
            <div className="form-label">Période</div>
            <div style={{ display:'flex', gap:6 }}>
              {['jour','mois','periode'].map(f => (
                <button key={f} className={`btn ${filtre===f?'btn-primary':'btn-outline'} btn-sm`}
                  onClick={() => setFiltre(f)}>
                  {f==='jour'?'📅 Jour':f==='mois'?'📆 Mois':'📊 Période'}
                </button>
              ))}
            </div>
          </div>
          {filtre === 'jour' && (
            <div>
              <div className="form-label">Date</div>
              <input className="form-input" type="date" value={dateJour}
                onChange={e => setDateJour(e.target.value)} style={{ width:180 }} />
            </div>
          )}
          {filtre === 'mois' && (
            <div>
              <div className="form-label">Mois</div>
              <input className="form-input" type="month" value={dateMois}
                onChange={e => setDateMois(e.target.value)} style={{ width:180 }} />
            </div>
          )}
          {filtre === 'periode' && (
            <>
              <div>
                <div className="form-label">Du</div>
                <input className="form-input" type="date" value={dateDebut}
                  onChange={e => setDateDebut(e.target.value)} style={{ width:160 }} />
              </div>
              <div>
                <div className="form-label">Au</div>
                <input className="form-input" type="date" value={dateFin}
                  onChange={e => setDateFin(e.target.value)} style={{ width:160 }} />
              </div>
            </>
          )}
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <button className="btn btn-outline btn-sm" onClick={handleExportCSV}>📥 CSV</button>
            <button className="btn btn-outline btn-sm" onClick={handleExportRapport}>🖨️ Rapport</button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'CA Total',        value:`${totalCA.toLocaleString('fr-FR')} F`,    color:'var(--g4)' },
          { label:'MTN MoMo',        value:`${totalMTN.toLocaleString('fr-FR')} F`,   color:'#E65100' },
          { label:'Airtel Money',    value:`${totalAir.toLocaleString('fr-FR')} F`,   color:'#C62828' },
          { label:'Carte Visa',      value:`${totalVis.toLocaleString('fr-FR')} F`,   color:'#1565C0' },
          { label:'Espèces',         value:`${totalEsp.toLocaleString('fr-FR')} F`,   color:'var(--g4)' },
          { label:'Part assurances', value:`${totalAssur.toLocaleString('fr-FR')} F`, color:'#6A1B9A' },
          { label:'Nb ventes',       value:ventes.length,                              color:'var(--t1)' },
        ].map((s, i) => (
          <div key={i} className="stat-card fade-in">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color:s.color, fontSize:18 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tableau complet */}
      <div className="card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h4>{getPeriodeLabel()} · {ventes.length} vente{ventes.length>1?'s':''}</h4>
        </div>

        {loading ? <div className="loader"><div className="spinner" /></div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>N° Cmd</th>
                  <th>Vendeuse</th>
                  <th>Caissière</th>
                  <th>Client</th>
                  <th>Assurance</th>
                  <th>Articles</th>
                  <th>Sous-total</th>
                  <th>Remise</th>
                  <th>Total</th>
                  <th>Paiement</th>
                </tr>
              </thead>
              <tbody>
                {ventes.map(v => (
                  <tr key={v.id} style={{ cursor:'pointer' }} onClick={() => setSelected(v)}>
                    <td style={{ fontSize:12, color:'var(--t3)', whiteSpace:'nowrap' }}>
                      {new Date(v.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td style={{ fontFamily:'Sora', fontWeight:700, color:'var(--g4)', fontSize:12 }}>{v.numero}</td>
                    <td style={{ fontWeight:500 }}>
                      {v.vendeuse ? `${v.vendeuse.prenom} ${v.vendeuse.nom}` : <span style={{ color:'var(--t3)' }}>—</span>}
                    </td>
                    <td style={{ color:'var(--t2)', fontSize:13 }}>
                      {v.caissiere ? `${v.caissiere.prenom} ${v.caissiere.nom}` : <span style={{ color:'var(--t3)' }}>—</span>}
                    </td>
                    <td style={{ color:'var(--t2)', fontSize:13 }}>
                      {v.client_nom || <span style={{ color:'var(--t3)' }}>—</span>}
                    </td>
                    <td>
                      {v.assurance?.nom
                        ? <span className="badge badge-green" style={{ fontSize:10 }}>{v.assurance.nom} · {v.taux_couverture}%</span>
                        : <span style={{ color:'var(--t3)' }}>—</span>}
                    </td>
                    <td>
                      <span className="badge badge-blue" style={{ fontSize:11 }}>
                        {v.commandes_pos_lignes?.length || 0} art.
                      </span>
                    </td>
                    <td style={{ fontSize:13, color:'var(--t2)' }}>
                      {v.sous_total?.toLocaleString('fr-FR')} F
                    </td>
                    <td style={{ fontSize:13, color:v.remise_montant>0?'#6A1B9A':'var(--t3)' }}>
                      {v.remise_montant>0 ? `-${v.remise_montant?.toLocaleString('fr-FR')} F` : '—'}
                    </td>
                    <td style={{ fontFamily:'Sora', fontWeight:700, color:'var(--g4)', whiteSpace:'nowrap' }}>
                      {v.total?.toLocaleString('fr-FR')} F
                    </td>
                    <td>
                      <span className="badge badge-blue" style={{ fontSize:10 }}>
                        {v.mode_paiement?.replace('_',' ').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal détail complet */}
      {selected && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setSelected(null) }}>
          <div className="modal" style={{ maxWidth:580 }}>
            <div className="modal-header">
              <div className="modal-title">Vente {selected.numero}</div>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* Infos générales */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 20px', fontSize:13, marginBottom:16, padding:14, background:'var(--g1)', borderRadius:10 }}>
              <div>
                <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Date</div>
                <div style={{ fontWeight:600 }}>{new Date(selected.created_at).toLocaleString('fr-FR')}</div>
              </div>
              <div>
                <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Mode paiement</div>
                <div style={{ fontWeight:600 }}>{selected.mode_paiement?.replace('_',' ').toUpperCase()}</div>
              </div>
              <div>
                <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Vendeuse</div>
                <div style={{ fontWeight:600 }}>{selected.vendeuse ? `${selected.vendeuse.prenom} ${selected.vendeuse.nom}` : '—'}</div>
              </div>
              <div>
                <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Caissière</div>
                <div style={{ fontWeight:600 }}>{selected.caissiere ? `${selected.caissiere.prenom} ${selected.caissiere.nom}` : '—'}</div>
              </div>
              {selected.client_nom && (
                <div>
                  <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Client</div>
                  <div style={{ fontWeight:600 }}>{selected.client_nom} {selected.client_tel && `· ${selected.client_tel}`}</div>
                </div>
              )}
              {selected.assurance?.nom && (
                <div>
                  <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Assurance</div>
                  <div style={{ fontWeight:600, color:'var(--g4)' }}>{selected.assurance.nom} · {selected.taux_couverture}%</div>
                </div>
              )}
              {selected.ref_paiement && (
                <div style={{ gridColumn:'1/-1' }}>
                  <div style={{ color:'var(--t3)', fontSize:11, marginBottom:2 }}>Réf. paiement</div>
                  <div style={{ fontWeight:600, fontFamily:'monospace' }}>{selected.ref_paiement}</div>
                </div>
              )}
            </div>

            {/* Lignes produits */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>
                Articles ({selected.commandes_pos_lignes?.length || 0})
              </div>
              {selected.commandes_pos_lignes?.map((l, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <span style={{ fontSize:22 }}>{l.produits?.emoji}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>{l.produits?.nom}</div>
                    <div style={{ fontSize:11, color:'var(--t3)' }}>
                      {l.produits?.conditionnement} · {l.prix_unitaire?.toLocaleString('fr-FR')} F/u × {l.quantite}
                      {l.remise_pct > 0 && <span style={{ color:'#6A1B9A', marginLeft:6 }}>· Remise {l.remise_pct}%</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:'Sora', fontWeight:700, color:'var(--g4)' }}>{l.total_ligne?.toLocaleString('fr-FR')} F</div>
                    {l.remise_pct > 0 && (
                      <div style={{ fontSize:11, color:'var(--t3)', textDecoration:'line-through' }}>
                        {(l.prix_unitaire * l.quantite)?.toLocaleString('fr-FR')} F
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Totaux */}
            <div style={{ background:'var(--g1)', borderRadius:10, padding:14 }}>
              {selected.remise_montant > 0 && (
                <>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--t2)', marginBottom:4 }}>
                    <span>Sous-total</span>
                    <span>{selected.sous_total?.toLocaleString('fr-FR')} F</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#6A1B9A', fontWeight:600, marginBottom:4 }}>
                    <span>🏥 Part assurance ({selected.taux_couverture}%)</span>
                    <span>−{selected.montant_assurance?.toLocaleString('fr-FR')} F</span>
                  </div>
                </>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Sora', fontSize:20, fontWeight:700, color:'var(--g4)', paddingTop:8, borderTop:'1px solid var(--border)' }}>
                <span>Total encaissé</span>
                <span>{selected.total?.toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── STOCK PAGE ────────────────────────────────────────────────
export function StockPage() {
  const { staff } = useContext(AuthContext)
  const [produits,   setProduits]   = useState([])
  const [categories, setCategories] = useState([])
  const [alertes,    setAlertes]    = useState([])
  const [mouvements, setMouvements] = useState([])
  const [search,     setSearch]     = useState('')
  const [curCat,     setCurCat]     = useState('all')
  const [tab,        setTab]        = useState('produits')
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [ajustModal, setAjustModal] = useState(null)
  const [ajustQty,   setAjustQty]   = useState(0)
  const [ajustNote,  setAjustNote]  = useState('')
  const [filtreStock,setFiltreStock]= useState('tous')  // tous | ok | faible | critique | rupture
  const [form, setForm] = useState({ nom: '', emoji: '💊', prix_fcfa: '', stock: '', conditionnement: '', categorie_id: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [p, c, a, m] = await Promise.all([getProduits(), getCategories(), getStockAlertes(), getStockMovements()])
    setProduits(p); setCategories(c); setAlertes(a); setMouvements(m)
    setLoading(false)
  }

  function getNiveau(stock) {
    if (stock === 0)  return 'rupture'
    if (stock < 5)    return 'critique'
    if (stock < 10)   return 'faible'
    return 'ok'
  }

  const filtered = produits.filter(p => {
    const matchSearch = !search || p.nom.toLowerCase().includes(search.toLowerCase())
    const matchCat    = curCat === 'all' || p.categories?.slug === curCat
    const matchFiltre = filtreStock === 'tous' || getNiveau(p.stock) === filtreStock
    return matchSearch && matchCat && matchFiltre
  })

  function handleExportEtatStock() {
    const totalValeur = produits.reduce((s, p) => s + p.stock * p.prix_fcfa, 0)
    const enRupture   = produits.filter(p => p.stock === 0).length
    const critique    = produits.filter(p => p.stock > 0 && p.stock < 5).length
    const faible      = produits.filter(p => p.stock >= 5 && p.stock < 10).length
    const ok          = produits.filter(p => p.stock >= 10).length

    exportRapportHTML(
      'État des stocks — Pharmacie CSU',
      `${produits.length} produits actifs · Valeur totale : ${totalValeur.toLocaleString('fr-FR')} FCFA`,
      [
        { label: 'Valeur totale stock', value: `${totalValeur.toLocaleString('fr-FR')} F` },
        { label: 'En rupture', value: enRupture, color: '#C62828' },
        { label: 'Critique (< 5)', value: critique, color: '#E65100' },
        { label: 'Faible (< 10)', value: faible, color: '#F9A825' },
        { label: 'OK (≥ 10)', value: ok, color: '#2E7D32' },
      ],
      ['Produit', 'Catégorie', 'Conditionnement', 'Stock', 'Prix unit.', 'Valeur stock', 'Niveau', 'Commander ?'],
      produits.map(p => {
        const niveau   = getNiveau(p.stock)
        const valeur   = p.stock * p.prix_fcfa
        const commander = niveau === 'rupture' || niveau === 'critique' || niveau === 'faible'
        return [
          `${p.emoji} ${p.nom}`,
          p.categories?.nom_fr || '—',
          p.conditionnement || '—',
          { value: p.stock, style: `font-weight:700;color:${niveau==='rupture'?'#C62828':niveau==='critique'?'#E65100':niveau==='faible'?'#F9A825':'#2E7D32'}` },
          `${p.prix_fcfa?.toLocaleString('fr-FR')} F`,
          `${valeur.toLocaleString('fr-FR')} F`,
          { html: `<span style="background:${niveau==='ok'?'#E8F5E9':niveau==='faible'?'#FFF8E1':niveau==='critique'?'#FFF3E0':'#FFEBEE'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;color:${niveau==='ok'?'#2E7D32':niveau==='faible'?'#F9A825':niveau==='critique'?'#E65100':'#C62828'}">${niveau}</span>` },
          { html: commander ? '<span style="color:#C62828;font-weight:700">⚠️ OUI</span>' : '<span style="color:#2E7D32">✓ Non</span>' },
        ]
      }),
      `ePharma · État de stock généré le ${new Date().toLocaleString('fr-FR')} · ${produits.filter(p => getNiveau(p.stock) !== 'ok').length} produit(s) à commander`
    )
  }

  function handleExportCSVStock() {
    const headers = ['Produit', 'Catégorie', 'Conditionnement', 'Stock', 'Prix unitaire FCFA', 'Valeur stock FCFA', 'Niveau']
    const rows = filtered.map(p => [
      p.nom, p.categories?.nom_fr || '', p.conditionnement || '',
      p.stock, p.prix_fcfa, p.stock * p.prix_fcfa, getNiveau(p.stock),
    ])
    exportCSV(headers, rows, `etat-stock-${Date.now()}.csv`)
  }

  async function handleAjuster() {
    if (!ajustModal || ajustQty === 0) return
    await ajusterStock(ajustModal.id, parseInt(ajustQty), staff.id, ajustNote)
    setAjustModal(null); setAjustQty(0); setAjustNote('')
    loadAll()
  }

  async function handleCreateProduit() {
    await createProduit({ ...form, prix_fcfa: parseInt(form.prix_fcfa), stock: parseInt(form.stock), actif: true })
    setShowModal(false)
    setForm({ nom: '', emoji: '💊', prix_fcfa: '', stock: '', conditionnement: '', categorie_id: '' })
    loadAll()
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>

  const totalValeur = filtered.reduce((s, p) => s + p.stock * p.prix_fcfa, 0)

  return (
    <div>
      {/* Barre actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {['produits', 'alertes', 'mouvements'].map(t => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setTab(t)}>
            {t === 'produits' ? '📦 Produits' : t === 'alertes' ? `⚠️ Alertes (${alertes.length})` : '📋 Mouvements'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-outline btn-sm" onClick={handleExportCSVStock}>📥 CSV</button>
        <button className="btn btn-outline btn-sm" onClick={handleExportEtatStock}>🖨️ État stock</button>
        <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Produit</button>
      </div>

      {tab === 'produits' && (
        <>
          {/* Filtres */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="form-input" placeholder="🔍 Rechercher..."
                value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
              <select className="form-input form-select" value={curCat}
                onChange={e => setCurCat(e.target.value)} style={{ width: 180 }}>
                <option value="all">Toutes catégories</option>
                {categories.map(c => <option key={c.slug} value={c.slug}>{c.emoji} {c.nom_fr}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                {['tous', 'ok', 'faible', 'critique', 'rupture'].map(f => (
                  <button key={f} className={`btn ${filtreStock === f ? 'btn-primary' : 'btn-outline'} btn-sm`}
                    onClick={() => setFiltreStock(f)}
                    style={{ color: filtreStock !== f && f === 'rupture' ? 'var(--danger2)' : filtreStock !== f && f === 'critique' ? '#E65100' : filtreStock !== f && f === 'faible' ? '#F9A825' : '' }}>
                    {f === 'tous' ? 'Tous' : f === 'ok' ? '✅ OK' : f === 'faible' ? '🟡 Faible' : f === 'critique' ? '🟠 Critique' : '🔴 Rupture'}
                  </button>
                ))}
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--t3)' }}>
                {filtered.length} produit{filtered.length > 1 ? 's' : ''} · Valeur : <strong style={{ color: 'var(--g4)' }}>{totalValeur.toLocaleString('fr-FR')} F</strong>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Produit</th><th>Catégorie</th><th>Prix</th><th>Stock</th><th>Valeur</th><th>Niveau</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const niveau = getNiveau(p.stock)
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 20 }}>{p.emoji}</span>
                            <div>
                              <div style={{ fontWeight: 600 }}>{p.nom}</div>
                              <div style={{ fontSize: 11, color: 'var(--t3)' }}>{p.conditionnement}</div>
                            </div>
                          </div>
                        </td>
                        <td><span className="badge badge-green">{p.categories?.nom_fr}</span></td>
                        <td style={{ fontFamily: 'Sora', fontWeight: 700, color: 'var(--g4)' }}>{p.prix_fcfa?.toLocaleString('fr-FR')} F</td>
                        <td>
                          <span className={`badge ${niveau === 'ok' ? 'badge-green' : niveau === 'faible' ? 'badge-amber' : 'badge-red'}`}>
                            {p.stock} unité{p.stock > 1 ? 's' : ''}
                          </span>
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--t2)' }}>{(p.stock * p.prix_fcfa).toLocaleString('fr-FR')} F</td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 600, color: niveau === 'ok' ? 'var(--g4)' : niveau === 'faible' ? '#F9A825' : niveau === 'critique' ? '#E65100' : 'var(--danger2)' }}>
                            {niveau === 'ok' ? '✅ OK' : niveau === 'faible' ? '🟡 Faible' : niveau === 'critique' ? '🟠 Critique' : '🔴 Rupture'}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-outline btn-sm" onClick={() => { setAjustModal(p); setAjustQty(0) }}>Ajuster</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'alertes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alertes.length === 0
            ? <div className="card" style={{ textAlign: 'center', color: 'var(--t3)', padding: 40 }}>✅ Tous les stocks sont suffisants</div>
            : alertes.map(a => (
              <div key={a.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 28 }}>{a.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{a.nom}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>{a.categorie}</div>
                </div>
                <span className={`badge ${a.niveau === 'rupture' || a.niveau === 'critique' ? 'badge-red' : 'badge-amber'}`}>
                  {a.niveau === 'rupture' ? '⛔ Rupture' : a.niveau === 'critique' ? '🔴 Critique' : '🟡 Faible'} · {a.stock} unité{a.stock > 1 ? 's' : ''}
                </span>
                <button className="btn btn-primary btn-sm" onClick={() => { setAjustModal(a); setAjustQty(0) }}>Réapprovisionner</button>
              </div>
            ))}
        </div>
      )}

      {tab === 'mouvements' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Produit</th><th>Type</th><th>Qté</th><th>Avant</th><th>Après</th><th>Staff</th><th>Note</th></tr></thead>
              <tbody>
                {mouvements.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 12, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                      {new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{m.produits?.emoji}</span>
                        <span style={{ fontWeight: 600 }}>{m.produits?.nom}</span>
                      </div>
                    </td>
                    <td><span className={`badge ${m.type_mvt === 'entree' || m.type_mvt === 'retour' ? 'badge-green' : m.type_mvt === 'vente' ? 'badge-blue' : 'badge-amber'}`}>{m.type_mvt}</span></td>
                    <td style={{ fontWeight: 700 }}>{m.type_mvt === 'sortie' || m.type_mvt === 'vente' ? '-' : '+'}{m.quantite}</td>
                    <td style={{ color: 'var(--t3)' }}>{m.stock_avant}</td>
                    <td style={{ fontWeight: 600, color: m.stock_apres < 5 ? 'var(--danger2)' : 'var(--g4)' }}>{m.stock_apres}</td>
                    <td style={{ fontSize: 12, color: 'var(--t3)' }}>{m.staff?.prenom} {m.staff?.nom}</td>
                    <td style={{ fontSize: 12, color: 'var(--t3)' }}>{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal ajustement */}
      {ajustModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAjustModal(null) }}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Ajuster — {ajustModal.nom}</div>
              <button className="modal-close" onClick={() => setAjustModal(null)}>✕</button>
            </div>
            <div style={{ marginBottom: 16, padding: 14, background: 'var(--g1)', borderRadius: 10, display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ fontSize: 28 }}>{ajustModal.emoji}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{ajustModal.nom}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>Stock actuel : <strong>{ajustModal.stock}</strong> unités</div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Quantité (+ ajouter, - retirer)</label>
              <input className="form-input" type="number" value={ajustQty} onChange={e => setAjustQty(e.target.value)} placeholder="Ex: 50 ou -5" />
            </div>
            <div className="form-group">
              <label className="form-label">Note</label>
              <input className="form-input" value={ajustNote} onChange={e => setAjustNote(e.target.value)} placeholder="Ex: Réception Laborex" />
            </div>
            <div style={{ padding: 10, background: 'var(--g1)', borderRadius: 8, fontSize: 13, marginBottom: 16, color: 'var(--t2)' }}>
              Nouveau stock : <strong style={{ color: 'var(--g4)' }}>{parseInt(ajustModal.stock || 0) + parseInt(ajustQty || 0)} unités</strong>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleAjuster}>Confirmer</button>
          </div>
        </div>
      )}

      {/* Modal nouveau produit */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Nouveau produit</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Nom</label>
                <input className="form-input" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Paracétamol 500mg" />
              </div>
              <div className="form-group">
                <label className="form-label">Emoji</label>
                <input className="form-input" value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Conditionnement</label>
                <input className="form-input" value={form.conditionnement} onChange={e => setForm({ ...form, conditionnement: e.target.value })} placeholder="Boîte de 20" />
              </div>
              <div className="form-group">
                <label className="form-label">Prix (FCFA)</label>
                <input className="form-input" type="number" value={form.prix_fcfa} onChange={e => setForm({ ...form, prix_fcfa: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Stock initial</label>
                <input className="form-input" type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Catégorie</label>
                <select className="form-input form-select" value={form.categorie_id} onChange={e => setForm({ ...form, categorie_id: e.target.value })}>
                  <option value="">-- Choisir --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.nom_fr}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }} onClick={handleCreateProduit}>Créer le produit</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── COMPTA PAGE ───────────────────────────────────────────────
export { default as ComptaPage } from './ComptaPage'

// ── ADMIN PAGE ────────────────────────────────────────────────
const ROLES       = ['admin', 'stock', 'vendeuse', 'caissiere', 'comptable']
const ROLE_LABELS = { admin: 'Administrateur', stock: 'Gestion Stock', vendeuse: 'Vendeuse', caissiere: 'Caissière', comptable: 'Comptable' }

export function AdminPage() {
  const [staff,     setStaff]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', telephone: '', role: 'vendeuse', password: '' })

  useEffect(() => { loadStaff() }, [])

  async function loadStaff() {
    const data = await getAllStaff()
    setStaff(data); setLoading(false)
  }

  async function handleCreate() {
    const { error } = await createStaff(form)
    if (error) { alert('Erreur: ' + error.message); return }
    setShowModal(false)
    setForm({ nom: '', prenom: '', email: '', telephone: '', role: 'vendeuse', password: '' })
    loadStaff()
  }

  async function toggleActif(member) {
    await updateStaff(member.id, { actif: !member.actif })
    loadStaff()
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 }}>
        {ROLES.map(r => (
          <div key={r} className="stat-card">
            <div className="stat-label" style={{ fontSize: 11 }}>{ROLE_LABELS[r]}</div>
            <div className="stat-value">{staff.filter(s => s.role === r).length}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h4>Membres du staff ({staff.length})</h4>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Nouveau membre</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.prenom} {s.nom}</td>
                  <td style={{ color: 'var(--t3)', fontSize: 13 }}>{s.email}</td>
                  <td style={{ color: 'var(--t3)', fontSize: 13 }}>{s.telephone || '—'}</td>
                  <td><span className={`badge ${s.role}`}>{ROLE_LABELS[s.role]}</span></td>
                  <td><span className={`badge ${s.actif ? 'badge-green' : 'badge-gray'}`}>{s.actif ? 'Actif' : 'Inactif'}</span></td>
                  <td><button className={`btn btn-sm ${s.actif ? 'btn-outline' : 'btn-primary'}`} onClick={() => toggleActif(s)}>{s.actif ? 'Désactiver' : 'Activer'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Nouveau membre</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group"><label className="form-label">Prénom</label><input className="form-input" value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Nom</label><input className="form-input" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} /></div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}><label className="form-label">Email</label><input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">Téléphone (2FA)</label><input className="form-input" value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} placeholder="+242 06..." /></div>
              <div className="form-group"><label className="form-label">Rôle</label>
                <select className="form-input form-select" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}><label className="form-label">Mot de passe provisoire</label><input className="form-input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></div>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }} onClick={handleCreate}>Créer le compte</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default StockPage