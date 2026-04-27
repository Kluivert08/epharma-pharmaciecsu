// ─── MagasinierPage.jsx — PATCH v2 ───────────────────────────
import React, { useEffect, useState, useContext, useRef } from 'react'
import { AuthContext } from '../App'
import {
  supabase,
  getCategories, getFournisseurs,
  createProduit, createLot,
  getProduitsReserve, getProduitsRayon,
  transfertLot, getLotByNumId,
  getStockMovements,
  formatPrix, formatDate,
} from '../lib/supabase'

// ── Génération code-barres SVG ────────────────────────────────
function genererBarresSVG(code) {
  const str = String(code || '')
  let bars = '', x = 5
  for (let i = 0; i < Math.min(str.length * 3, 58); i++) {
    const w = (i % 3 === 0) ? 3 : (i % 3 === 1) ? 2 : 1
    const h = (i % 5 === 0) ? 50 : 40
    bars += `<rect x="${x}" y="5" width="${w}" height="${h}" fill="#000"/>`
    x += w + 1
  }
  return bars
}

function genNumId(prefixe = 'LOT') {
  return `${prefixe}-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 999)}`
}

function imprimerEtiquettes(produit, lot, quantite) {
  const etiquettes = Array.from({ length: quantite }, () => `
    <div class="etiquette">
      <div class="pharmacie">Pharmacie CSU</div>
      <div class="nom">${produit.nom}</div>
      <div class="prix">${(produit.prix_ttc || produit.prix_fcfa || 0).toLocaleString('fr-FR')} FCFA</div>
      <div class="codebarre">
        <svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
          ${genererBarresSVG(lot.num_id)}
        </svg>
      </div>
      <div class="info-row">
        <span>ID: ${String(produit.id || '').slice(0, 8)}</span>
        <span>${lot.num_id}</span>
      </div>
      <div class="peremption">Exp: ${lot.date_peremption ? new Date(lot.date_peremption).toLocaleDateString('fr-FR') : '—'}</div>
    </div>`).join('')

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Étiquettes</title>
<style>
  @page { size: 6cm 4cm; margin: 0 }
  body { margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif }
  .etiquette { width: 6cm; height: 4cm; box-sizing: border-box; padding: 4px 6px;
    display: flex; flex-direction: column; justify-content: space-between;
    border: 0.5px solid #ccc; page-break-after: always; overflow: hidden }
  .pharmacie { font-size: 7px; color: #666; text-transform: uppercase; letter-spacing: .5px }
  .nom { font-size: 11px; font-weight: 700; color: #1a2e1a; line-height: 1.2 }
  .prix { font-size: 13px; font-weight: 800; color: #1B5E20 }
  .codebarre svg { width: 100%; height: 40px }
  .info-row { display: flex; justify-content: space-between; font-size: 6px; color: #888; font-family: monospace }
  .peremption { font-size: 7px; color: #C62828; font-weight: 600 }
</style></head><body>${etiquettes}</body></html>`
  const w = window.open('', '_blank')
  w.document.write(html); w.document.close()
  setTimeout(() => w.print(), 300)
}

function exportRapportReserve(produits) {
  const lignes = produits.map(p => {
    const qte   = p.stock_reserve ?? p.quantite ?? 0
    const seuil = p.seuil_stock || 10
    const niv   = qte <= 0 ? '🔴 Rupture' : qte < seuil ? '🟠 Critique' : '✅ OK'
    return `<tr>
      <td>${p.emoji || '💊'} ${p.nom}</td>
      <td style="font-family:monospace">${p.coderange || '—'}</td>
      <td style="font-weight:700">${qte}</td>
      <td>${seuil}</td>
      <td>${p.date_peremption ? new Date(p.date_peremption).toLocaleDateString('fr-FR') : '—'}</td>
      <td>${niv}</td>
    </tr>`
  }).join('')
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>État Réserve</title>
<style>
  body{font-family:'Segoe UI',sans-serif;margin:40px;color:#1a2e1a}
  h1{color:#1B5E20}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#F0F7EE;padding:10px;text-align:left;font-size:11px;font-weight:600;color:#7A9E7A;text-transform:uppercase;border-bottom:2px solid #C8E6C0}
  td{padding:10px;border-bottom:1px solid #E8F0E8}
  .footer{margin-top:24px;font-size:11px;color:#7A9E7A;text-align:center}
</style></head><body>
<h1>✚ État Réserve — Pharmacie CSU</h1>
<p style="color:#7A9E7A">Généré le ${new Date().toLocaleString('fr-FR')} · ${produits.length} produit(s)</p>
<table><thead><tr><th>Produit</th><th>Emplacement</th><th>Stock</th><th>Seuil</th><th>Péremption</th><th>Niveau</th></tr></thead>
<tbody>${lignes}</tbody></table>
<div class="footer">ePharma · État généré automatiquement</div>
</body></html>`
  const w = window.open('', '_blank')
  w.document.write(html); w.document.close()
  setTimeout(() => w.print(), 300)
}

const FORM_VIDE = {
  nom: '', emoji: '💊', conditionnement: '', categorie_id: '',
  fournisseur_id: '', prix_achat: '', prix_vente_ht: '',
  tva_pct: 18, ca_pct: 5, prix_ttc: '',
  quantite: '', seuil_stock: '', seuil_rayon: '',
  code_barre: '', num_id: '', date_peremption: '',
  coderange: '', gratuit: false,
}

// ─────────────────────────────────────────────────────────────
export default function MagasinierPage() {
  const { staff } = useContext(AuthContext)
  const [tab, setTab] = useState('rayon')

  const [reserve,      setReserve]      = useState([])
  const [rayon,        setRayon]        = useState([])
  const [mouvements,   setMouvements]   = useState([])
  const [categories,   setCategories]   = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading,      setLoading]      = useState(true)

  // Scan
  const [scanInput,   setScanInput]   = useState('')
  const [scanResult,  setScanResult]  = useState(null)
  const [scanMsg,     setScanMsg]     = useState(null)
  const [codeRayon,   setCodeRayon]   = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const scanRef = useRef(null)

  // Recherche
  const [rechercheQ,   setRechercheQ]   = useState('')
  const [rechercheRes, setRechercheRes] = useState([])

  // ── BC livrés en attente réception physique ────────────────
  const [bonsCommande,   setBonsCommande]   = useState([])
  const [bcSelectionne,  setBcSelectionne]  = useState(null)
  const [lignesBcFiltre, setLignesBcFiltre] = useState([])
  const [ligneSelectId,  setLigneSelectId]  = useState('')
  const [bcLoading,      setBcLoading]      = useState(false)

  // Formulaire réception
  const [form,        setForm]        = useState(FORM_VIDE)
  const [recepLoading,setRecepLoading]= useState(false)
  const [recepMsg,    setRecepMsg]    = useState(null)

  useEffect(() => { loadAll() }, [])

  // Charger BC statut "livre" à chaque fois qu'on bascule sur l'onglet réception
  useEffect(() => {
    if (tab === 'reception') loadBonsCommande()
  }, [tab])

  // Calcul TTC auto
  useEffect(() => {
    // Gratuit = prix_achat à 0, mais prix_vente_ht/TVA/CA/TTC restent renseignés
    if (form.gratuit && !form.prix_vente_ht) return
    const ht  = parseFloat(form.prix_vente_ht) || 0
    const tva = parseFloat(form.tva_pct) || 0
    const ca  = (tva * (parseFloat(form.ca_pct) || 0)) / 100
    const ttc = Math.round(ht * (1 + tva / 100) + (ht * ca / 100))
    setForm(f => ({ ...f, prix_ttc: ttc || '' }))
  }, [form.prix_vente_ht, form.tva_pct, form.ca_pct, form.gratuit])

  async function loadAll() {
    setLoading(true)
    const [r, ray, m, c, f] = await Promise.all([
      getProduitsReserve(), getProduitsRayon(),
      getStockMovements(200), getCategories(), getFournisseurs(),
    ])
    setReserve(r); setRayon(ray); setMouvements(m)
    setCategories(c); setFournisseurs(f)
    setLoading(false)
  }

  // ── Charger BC au statut "livre" ────────────────────────────
  async function loadBonsCommande() {
    setBcLoading(true)
    const { data, error } = await supabase
      .from('bons_commande')
      .select(`
        id, numero, statut, total_ht, created_at, num_bl, agent_nom, agent_tel,
        fournisseurs ( id, nom ),
        lignes:bons_commande_lignes (
          id, quantite, prix_unitaire, total_ligne,
          produits (
            id, nom, emoji, conditionnement, code_barre,
            prix_achat, prix_vente_ht, tva_pct, ca_pct, prix_ttc,
            seuil_stock, seuil_rayon
          )
        )
      `)
      .eq('statut', 'livre')
      .order('created_at', { ascending: false })
    setBonsCommande(data ?? [])
    setBcLoading(false)
  }

  // ── Sélection BC ─────────────────────────────────────────────
  function handleSelectBC(bcId) {
    if (!bcId) {
      setBcSelectionne(null); setLignesBcFiltre([])
      setLigneSelectId(''); setForm(FORM_VIDE); return
    }
    const bc = bonsCommande.find(b => b.id === bcId)
    setBcSelectionne(bc || null)
    setLignesBcFiltre(bc?.lignes || [])
    setLigneSelectId('')
    setForm({ ...FORM_VIDE, fournisseur_id: bc?.fournisseurs?.id || '' })
    setRecepMsg(null)
  }

  // ── Sélection ligne BC → pré-remplissage ─────────────────────
  function handleSelectLigne(ligneId) {
    setLigneSelectId(ligneId)
    if (!ligneId) { setForm(f => ({ ...FORM_VIDE, fournisseur_id: f.fournisseur_id })); return }
    const ligne = lignesBcFiltre.find(l => l.id === ligneId)
    if (!ligne) return
    const p   = ligne.produits || {}
    const ht  = parseFloat(p.prix_vente_ht) || 0
    const tva = parseFloat(p.tva_pct) || 18
    const ca  = parseFloat(p.ca_pct)  || 5
    const ttc = ht > 0 ? Math.round(ht * (1 + tva / 100) + (ht * tva / 100 * ca / 100)) : (p.prix_ttc || '')
    setForm(f => ({
      ...f,
      nom:             p.nom             || '',
      emoji:           p.emoji           || '💊',
      conditionnement: p.conditionnement || '',
      code_barre:      p.code_barre      || '',
      prix_achat:      String(ligne.prix_unitaire ?? p.prix_achat ?? ''),
      prix_vente_ht:   String(ht || ''),
      tva_pct: tva, ca_pct: ca,
      prix_ttc:        String(ttc),
      seuil_stock:     String(p.seuil_stock || ''),
      seuil_rayon:     String(p.seuil_rayon || ''),
      quantite:        String(ligne.quantite || ''),
      date_peremption: '',
    }))
  }

  // ── Scan transfert ────────────────────────────────────────────
  async function handleScan(e) {
    e.preventDefault()
    if (!scanInput.trim()) return
    setScanLoading(true); setScanMsg(null); setScanResult(null)
    const lot = await getLotByNumId(scanInput.trim())
    if (!lot) setScanMsg({ type:'error', text: `Lot "${scanInput}" introuvable.` })
    else       setScanResult(lot)
    setScanLoading(false)
  }

  async function handleTransfert() {
    if (!scanResult) return
    setScanLoading(true)
    const { error } = await transfertLot(scanResult.num_id, staff.id, codeRayon || null)
    if (error) {
      setScanMsg({ type:'error', text: error.message })
    } else {
      const dest = scanResult.statut === 'reserve' ? 'RAYON' : 'RÉSERVE'
      setScanMsg({ type:'success', text: `✅ Lot transféré vers ${dest} !` })
      setScanResult(null); setScanInput(''); setCodeRayon('')
      loadAll()
    }
    setScanLoading(false)
  }

  // ── Recherche ─────────────────────────────────────────────────
  async function handleRecherche(q) {
    setRechercheQ(q)
    if (q.length < 2) { setRechercheRes([]); return }
    const { data } = await supabase.from('v_stock_peremption').select('*').ilike('nom', `%${q}%`).limit(30)
    setRechercheRes(data ?? [])
  }

  // ── Réception → Réserve ───────────────────────────────────────
  async function handleReception() {
    if (!form.nom.trim())      { setRecepMsg({ type:'error', text:'Nom obligatoire.' }); return }
    if (!form.prix_vente_ht) { setRecepMsg({ type:'error', text:'Prix de vente HT obligatoire (même pour un produit gratuit).' }); return }
    if (!form.quantite)        { setRecepMsg({ type:'error', text:'Quantité obligatoire.' }); return }
    if (!form.date_peremption) { setRecepMsg({ type:'error', text:'Date de péremption obligatoire.' }); return }

    setRecepLoading(true); setRecepMsg(null)
    try {
      const produitData = {
        nom:             form.nom.trim(),
        emoji:           form.emoji || '💊',
        conditionnement: form.conditionnement,
        categorie_id:    form.categorie_id  || null,
        fournisseur_id:  form.fournisseur_id|| null,
        code_barre:      form.code_barre    || null,
        prix_achat:      form.gratuit ? 0 : parseFloat(form.prix_achat) || 0,
        prix_vente_ht:   parseFloat(form.prix_vente_ht) || 0,   // toujours renseigné, même gratuit
        tva_pct:         parseFloat(form.tva_pct) || 18,
        ca_pct:          parseFloat(form.ca_pct)  || 5,
        // prix_ttc est GENERATED ALWAYS côté Supabase — ne pas l'insérer
        seuil_stock:     parseInt(form.seuil_stock) || 10,
        seuil_rayon:     parseInt(form.seuil_rayon) || 5,
        actif:           true,
      }

      const { data: produit, error: errP } = await createProduit(produitData)
      if (errP) throw errP

      const numId = form.num_id.trim() || genNumId()
      const { error: errL } = await createLot({
        produit_id:      produit.id,
        bon_commande_id: bcSelectionne?.id || null,
        num_id:          numId,
        quantite:        parseInt(form.quantite),
        quantite_rayon:  0,
        date_peremption: form.date_peremption,
        coderange:       form.coderange || null,
        coderayon:       null,
        gratuit:         form.gratuit,
        statut:          'reserve',
        created_by:      staff.id,
      })
      if (errL) throw errL

      // Insertion stock mouvement
      await supabase.from('stock_mouvements').insert({
        produit_id: produit.id, staff_id: staff.id,
        type_mvt: 'entree_reserve', quantite: parseInt(form.quantite),
        notes: bcSelectionne ? `Réception BC ${bcSelectionne.numero}` : 'Réception manuelle',
      })

      // Si lié à un BC : vérifier si toutes les lignes sont reçues → passer BC en "recu"
      if (bcSelectionne) {
        // Vérifier si des lots existent maintenant pour toutes les lignes du BC
        const { data: lotsBC } = await supabase
          .from('produit_peremption')
          .select('id')
          .eq('bon_commande_id', bcSelectionne.id)
        const nbLignes = bcSelectionne.lignes?.length || 0
        if (lotsBC && lotsBC.length >= nbLignes && nbLignes > 0) {
          await supabase.from('bons_commande').update({ statut: 'recu', recu_at: new Date().toISOString() }).eq('id', bcSelectionne.id)
        }
      }

      // Imprimer étiquettes
      imprimerEtiquettes(
        { ...produit, nom: form.nom },
        { num_id: numId, date_peremption: form.date_peremption },
        parseInt(form.quantite)
      )

      setRecepMsg({ type:'success', text: `✅ ${form.quantite} × "${form.nom}" enregistré(s) à la Réserve. Étiquettes en cours d'impression.` })
      setForm(FORM_VIDE)
      setBcSelectionne(null); setLigneSelectId(''); setLignesBcFiltre([])
      loadAll()
      // Recharger BC pour retirer celui qui vient d'être finalisé
      loadBonsCommande()
    } catch (e) {
      setRecepMsg({ type:'error', text: e.message || JSON.stringify(e) })
    }
    setRecepLoading(false)
  }

  const rayonAlertes   = rayon.filter(p   => (p.stock_rayon   ?? p.quantite_rayon ?? 0) <= (p.seuil_rayon  || 5))
  const reserveAlertes = reserve.filter(p => (p.stock_reserve ?? p.quantite       ?? 0) <= (p.seuil_stock  || 10))

  if (loading) return <div className="loader"><div className="spinner" /></div>

  return (
    <div className="fade-in">

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Produits au Rayon',   value:rayon.length,          color:'var(--g4)',    icon:'🏪' },
          { label:'Produits en Réserve', value:reserve.length,        color:'var(--blue4)', icon:'🏭' },
          { label:'BC à réceptionner',   value:bonsCommande.length,   color:bonsCommande.length>0?'var(--warn2)':'var(--t3)', icon:'📦' },
          { label:'Alertes Rayon',       value:rayonAlertes.length,   color:rayonAlertes.length>0?'var(--danger2)':'var(--g4)', icon:'⚠️' },
        ].map(s => (
          <div key={s.label} className="stat-card fade-in">
            <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { id:'rayon',      label:'🏪 Rayon' },
          { id:'reserve',    label:'🏭 Réserve' },
          { id:'scan',       label:'📷 Scan Transfert' },
          { id:'reception',  label:'📦 Réceptionner', badge: bonsCommande.length },
          { id:'recherche',  label:'🔍 Localisation' },
          { id:'historique', label:'📋 Historique' },
        ].map(t => (
          <button key={t.id} className={`btn ${tab===t.id?'btn-primary':'btn-outline'} btn-sm`}
            onClick={() => setTab(t.id)} style={{ display:'flex', alignItems:'center', gap:6 }}>
            {t.label}
            {t.badge > 0 && (
              <span style={{ background:'var(--warn2)', color:'#fff', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10 }}>
                {t.badge}
              </span>
            )}
            {t.id==='rayon' && rayonAlertes.length>0 && tab!=='rayon' && (
              <span style={{ background:'var(--danger2)', color:'#fff', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10 }}>
                {rayonAlertes.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── RAYON ── */}
      {tab === 'rayon' && (
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <h4 style={{ margin:0 }}>Stock Rayon — {rayon.length} produit(s)</h4>
            <button className="btn btn-outline btn-sm" onClick={loadAll}>🔄 Actualiser</button>
          </div>
          {rayon.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Aucun produit au rayon</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Produit</th><th>Emplacement Rayon</th><th>Stock</th><th>Seuil Recharge</th><th>Péremption</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {rayon.map((p, i) => {
                    const qte   = p.stock_rayon ?? p.quantite_rayon ?? 0
                    const seuil = p.seuil_rayon || 5
                    const alerte = qte <= seuil
                    const jours  = p.date_peremption ? Math.floor((new Date(p.date_peremption) - new Date()) / 86400000) : null
                    return (
                      <tr key={p.id||i} style={{ background: alerte?'rgba(229,57,53,.04)':undefined }}>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:20 }}>{p.emoji||'💊'}</span>
                            <div>
                              <div style={{ fontWeight:600 }}>{p.nom}</div>
                              <div style={{ fontSize:11, color:'var(--t3)' }}>{p.conditionnement}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--t2)' }}>
                          {p.coderayon || <span style={{ color:'var(--t3)' }}>—</span>}
                        </td>
                        <td><span className={`badge ${alerte?'badge-red':'badge-green'}`}>{qte} u.</span></td>
                        <td style={{ fontSize:13, color:'var(--t3)' }}>{seuil} u.</td>
                        <td>
                          {jours!==null ? (
                            <span style={{ fontSize:12, fontWeight:600, color:jours<0?'var(--danger2)':jours<30?'var(--warn2)':'var(--t3)' }}>
                              {jours<0?'⛔ Expiré':`J-${jours}`}
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          {alerte
                            ? <span className="badge badge-red" style={{ fontSize:10 }}>⚠️ À ravitailler</span>
                            : <span className="badge badge-green" style={{ fontSize:10 }}>✅ OK</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RÉSERVE ── */}
      {tab === 'reserve' && (
        <div className="card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <h4 style={{ margin:0 }}>Stock Réserve — {reserve.length} produit(s)</h4>
            <button className="btn btn-outline btn-sm" onClick={() => exportRapportReserve(reserve)}>🖨️ État Réserve</button>
          </div>
          {reserve.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Réserve vide</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Produit</th><th>Ref. Lot</th><th>Emplacement Réserve</th><th>Quantité</th><th>Seuil</th><th>Péremption</th><th>Gratuit</th><th>Niveau</th></tr>
                </thead>
                <tbody>
                  {reserve.map((p, i) => {
                    const qte   = p.stock_reserve ?? p.quantite ?? 0
                    const seuil = p.seuil_stock || 10
                    const alerte = qte <= seuil
                    const jours  = p.date_peremption ? Math.floor((new Date(p.date_peremption) - new Date()) / 86400000) : null
                    return (
                      <tr key={p.id||i} style={{ background: alerte?'rgba(229,57,53,.04)':undefined }}>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:18 }}>{p.emoji||'💊'}</span>
                            <div>
                              <div style={{ fontWeight:600 }}>{p.nom}</div>
                              <div style={{ fontSize:11, color:'var(--t3)' }}>{p.conditionnement}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontFamily:'monospace', fontSize:11 }}>{p.num_id||'—'}</td>
                        <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--t2)' }}>
                          {p.coderange || <span style={{ color:'var(--t3)' }}>—</span>}
                        </td>
                        <td><span className={`badge ${alerte?'badge-red':'badge-green'}`}>{qte} u.</span></td>
                        <td style={{ fontSize:13, color:'var(--t3)' }}>{seuil} u.</td>
                        <td>
                          {jours!==null ? (
                            <span style={{ fontSize:12, fontWeight:600, color:jours<0?'var(--danger2)':jours<30?'var(--warn2)':'var(--t3)' }}>
                              {jours<0?'⛔ Expiré':`J-${jours}`}
                              <br/><span style={{ fontWeight:400, fontSize:11 }}>{new Date(p.date_peremption).toLocaleDateString('fr-FR')}</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          {p.gratuit
                            ? <span className="badge badge-amber" style={{ fontSize:10 }}>🎁 Gratuit</span>
                            : <span style={{ color:'var(--t3)', fontSize:12 }}>—</span>
                          }
                        </td>
                        <td>
                          {alerte
                            ? <span style={{ color:'var(--danger2)', fontSize:11, fontWeight:700 }}>⚠️ Commander</span>
                            : <span style={{ color:'var(--g4)', fontSize:11, fontWeight:600 }}>✅ OK</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── SCAN TRANSFERT ── */}
      {tab === 'scan' && (
        <div style={{ maxWidth:560 }}>
          <div className="card" style={{ marginBottom:16 }}>
            <h4 style={{ marginBottom:4 }}>📷 Scan Transfert Réserve ↔ Rayon</h4>
            <p style={{ color:'var(--t3)', fontSize:13, marginBottom:16 }}>
              Scannez le code-barres d'un lot. Réserve → Rayon, ou Rayon → Réserve.
            </p>
            <form onSubmit={handleScan} style={{ display:'flex', gap:10, marginBottom:16 }}>
              <input ref={scanRef} className="form-input" autoFocus
                placeholder="Scanner ou saisir la référence lot..."
                value={scanInput} onChange={e => setScanInput(e.target.value)} style={{ flex:1 }} />
              <button className="btn btn-primary" type="submit" disabled={scanLoading}>
                {scanLoading?'⏳':'🔍 Chercher'}
              </button>
            </form>

            {scanMsg && (
              <div className={`alert ${scanMsg.type==='success'?'alert-success':'alert-error'}`} style={{ marginBottom:12 }}>
                {scanMsg.text}
              </div>
            )}

            {scanResult && (
              <div style={{ padding:14, background:'var(--g1)', borderRadius:12, border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <span style={{ fontSize:28 }}>{scanResult.produits?.emoji||'💊'}</span>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{scanResult.produits?.nom}</div>
                    <div style={{ fontSize:12, color:'var(--t3)' }}>Ref: {scanResult.num_id}</div>
                  </div>
                  <span className={`badge ${scanResult.statut==='reserve'?'badge-blue':'badge-green'}`} style={{ marginLeft:'auto' }}>
                    {scanResult.statut==='reserve'?'🏭 Réserve':'🏪 Rayon'}
                  </span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, fontSize:12, color:'var(--t2)', marginBottom:12 }}>
                  <div><div style={{ color:'var(--t3)', fontSize:11 }}>Quantité</div><strong>{scanResult.quantite}</strong></div>
                  <div><div style={{ color:'var(--t3)', fontSize:11 }}>Péremption</div><strong>{scanResult.date_peremption?new Date(scanResult.date_peremption).toLocaleDateString('fr-FR'):'—'}</strong></div>
                  <div><div style={{ color:'var(--t3)', fontSize:11 }}>Prix TTC</div><strong>{(scanResult.produits?.prix_ttc||0).toLocaleString('fr-FR')} F</strong></div>
                </div>
                {scanResult.statut === 'reserve' && (
                  <div className="form-group" style={{ marginBottom:12 }}>
                    <label className="form-label">Code Rayon (emplacement)</label>
                    <input className="form-input" placeholder="Ex: R-A-02" value={codeRayon} onChange={e => setCodeRayon(e.target.value)} />
                  </div>
                )}
                <div style={{ padding:10, background:scanResult.statut==='reserve'?'rgba(27,94,32,.08)':'rgba(21,101,192,.08)', borderRadius:8, fontSize:13, marginBottom:12 }}>
                  {scanResult.statut==='reserve'
                    ? `➡️ Ce lot va être transféré vers le Rayon${codeRayon?` (${codeRayon})`:''}`
                    : '⬅️ Ce lot va retourner du Rayon vers la Réserve'}
                </div>
                <button className="btn btn-primary btn-lg" style={{ width:'100%' }}
                  onClick={handleTransfert} disabled={scanLoading}>
                  {scanLoading?'⏳ Transfert...'
                    :scanResult.statut==='reserve'?'🏪 Envoyer au Rayon':'🏭 Retour Réserve'}
                </button>
              </div>
            )}
          </div>
          <div className="card" style={{ padding:'12px 14px', background:'var(--g1)', fontSize:13, color:'var(--t2)' }}>
            <strong>Logique FEFO</strong> : Les lots les plus proches de péremption sont prioritaires pour le rayon. Scannez n'importe quel article d'un lot — tout le lot suit.
          </div>
        </div>
      )}

      {/* ── RÉCEPTION PRODUIT ── */}
      {tab === 'reception' && (
        <div style={{ maxWidth:700 }}>
          <div className="card">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h4 style={{ margin:0 }}>📦 Réceptionner un produit à la Réserve</h4>
              <button className="btn btn-outline btn-sm" onClick={loadBonsCommande} disabled={bcLoading}>
                {bcLoading?'⏳':'🔄 Actualiser BC'}
              </button>
            </div>

            {recepMsg && (
              <div className={`alert ${recepMsg.type==='success'?'alert-success':'alert-error'}`} style={{ marginBottom:16 }}>
                {recepMsg.text}
              </div>
            )}

            {/* ÉTAPE 1 : Sélection BC livré */}
            <div style={{ marginBottom:16, padding:'12px 14px', background:'var(--g1)', borderRadius:10, border:'1px solid var(--border)' }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:22, height:22, borderRadius:11, background:'var(--g4)', color:'#fff', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>1</span>
                Sélectionner le Bon de Commande livré
                <span style={{ fontWeight:400, color:'var(--t3)', fontSize:11, marginLeft:4 }}>(optionnel)</span>
              </div>

              {bcLoading ? (
                <div style={{ fontSize:12, color:'var(--t3)', padding:'8px 0' }}>⏳ Chargement des BC livrés...</div>
              ) : bonsCommande.length === 0 ? (
                <div style={{ fontSize:12, color:'var(--t3)', fontStyle:'italic', padding:'8px 0' }}>
                  Aucun BC en attente de réception. Les BC apparaissent ici une fois que le comptable enregistre le bon de livraison fournisseur (statut « Livré »).
                </div>
              ) : (
                <>
                  <select className="form-input form-select" value={bcSelectionne?.id||''} onChange={e => handleSelectBC(e.target.value)}>
                    <option value="">-- Saisie manuelle (sans BC) --</option>
                    {bonsCommande.map(bc => (
                      <option key={bc.id} value={bc.id}>
                        {bc.numero} · {bc.fournisseurs?.nom||'—'} · BL: {bc.num_bl||'?'} · Livreur: {bc.agent_nom||'?'}
                      </option>
                    ))}
                  </select>

                  {bcSelectionne && lignesBcFiltre.length > 0 && (
                    <div style={{ marginTop:10 }}>
                      <div style={{ fontSize:11, color:'var(--t3)', marginBottom:6 }}>
                        {lignesBcFiltre.length} produit(s) · Fournisseur : <strong>{bcSelectionne.fournisseurs?.nom}</strong>
                        {bcSelectionne.agent_nom && <> · Livreur : <strong>{bcSelectionne.agent_nom}</strong></>}
                      </div>
                      <select className="form-input form-select" value={ligneSelectId} onChange={e => handleSelectLigne(e.target.value)}>
                        <option value="">-- Choisir le produit à réceptionner --</option>
                        {lignesBcFiltre.map(l => (
                          <option key={l.id} value={l.id}>
                            {l.produits?.emoji||'💊'} {l.produits?.nom||'—'} · Qté : {l.quantite} · {formatPrix(l.prix_unitaire)}
                          </option>
                        ))}
                      </select>
                      {ligneSelectId && (
                        <div style={{ marginTop:8, padding:'8px 12px', background:'rgba(27,94,32,.08)', borderRadius:8, fontSize:12, color:'var(--g4)', fontWeight:600 }}>
                          ✅ Formulaire pré-rempli — saisissez la date de péremption réelle du produit
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ÉTAPE 2 : Formulaire produit */}
            <div style={{ fontWeight:700, fontSize:13, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:22, height:22, borderRadius:11, background:'var(--g4)', color:'#fff', fontSize:11, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>2</span>
              Détails du produit
            </div>

            {/* Toggle Gratuit */}
            <div
              style={{ marginBottom:16, padding:'10px 14px', background:form.gratuit?'var(--g1)':'var(--bg)', border:`2px solid ${form.gratuit?'var(--g3)':'var(--border)'}`, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }}
              onClick={() => setForm(f => ({ ...f, gratuit: !f.gratuit }))}>
              <div>
                <div style={{ fontWeight:600, fontSize:13 }}>🎁 Produit Gratuit</div>
                <div style={{ fontSize:11, color:'var(--t3)' }}>Livré gratuitement — ne sera pas facturé au fournisseur</div>
              </div>
              <div style={{ width:40, height:22, borderRadius:11, background:form.gratuit?'var(--g4)':'var(--border)', position:'relative', transition:'background .2s', flexShrink:0 }}>
                <div style={{ position:'absolute', top:3, left:form.gratuit?20:3, width:16, height:16, borderRadius:8, background:'#fff', transition:'left .2s' }} />
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Nom du produit <span style={{ color:'var(--danger2)' }}>*</span></label>
                <input className="form-input" value={form.nom} placeholder="Ex: Paracétamol 500mg" onChange={e => setForm({...form, nom:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Emoji</label>
                <input className="form-input" value={form.emoji} onChange={e => setForm({...form, emoji:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Conditionnement</label>
                <input className="form-input" value={form.conditionnement} placeholder="Boîte de 20" onChange={e => setForm({...form, conditionnement:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Catégorie</label>
                <select className="form-input form-select" value={form.categorie_id} onChange={e => setForm({...form, categorie_id:e.target.value})}>
                  <option value="">-- Choisir --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.nom_fr}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fournisseur</label>
                <select className="form-input form-select" value={form.fournisseur_id} onChange={e => setForm({...form, fournisseur_id:e.target.value})}>
                  <option value="">-- Choisir --</option>
                  {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </div>

              {/* Prix — prix_achat masqué/forcé à 0 si gratuit, les autres toujours visibles */}
              <div className="form-group">
                <label className="form-label" style={{ color:form.gratuit?'var(--t3)':undefined }}>
                  Prix d'achat HT (FCFA){form.gratuit&&<span style={{ marginLeft:6, fontSize:10, color:'var(--g4)' }}>— 0 (gratuit)</span>}
                </label>
                <input className="form-input" type="number" value={form.gratuit?'0':form.prix_achat}
                  placeholder="0" disabled={form.gratuit}
                  style={form.gratuit?{background:'var(--g1)',color:'var(--t3)'}:{}}
                  onChange={e => setForm({...form, prix_achat:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Prix de vente HT (FCFA) <span style={{ color:'var(--danger2)' }}>*</span></label>
                <input className="form-input" type="number" value={form.prix_vente_ht} placeholder="0" onChange={e => setForm({...form, prix_vente_ht:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">TVA (%)</label>
                <input className="form-input" type="number" value={form.tva_pct} onChange={e => setForm({...form, tva_pct:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">CA — Centime Additionnel (% de TVA)</label>
                <input className="form-input" type="number" value={form.ca_pct} onChange={e => setForm({...form, ca_pct:e.target.value})} />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Prix TTC (calculé automatiquement)</label>
                <input className="form-input" type="number" value={form.prix_ttc} readOnly
                  style={{ background:'var(--g1)', fontWeight:700, color:'var(--g4)', fontSize:16 }} />
                <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>
                  HT {parseFloat(form.prix_vente_ht)||0} × (1 + {form.tva_pct}%) + CA {form.ca_pct}% de TVA
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Quantité reçue <span style={{ color:'var(--danger2)' }}>*</span></label>
                <input className="form-input" type="number" value={form.quantite} placeholder="Ex: 97" onChange={e => setForm({...form, quantite:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Date de péremption <span style={{ color:'var(--danger2)' }}>*</span>
                  <span style={{ fontSize:10, color:'var(--warn2)', marginLeft:6 }}>date réelle sur le produit</span>
                </label>
                <input className="form-input" type="date" value={form.date_peremption} onChange={e => setForm({...form, date_peremption:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Seuil alerte réserve</label>
                <input className="form-input" type="number" value={form.seuil_stock} placeholder="10" onChange={e => setForm({...form, seuil_stock:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Seuil recharge rayon</label>
                <input className="form-input" type="number" value={form.seuil_rayon} placeholder="5" onChange={e => setForm({...form, seuil_rayon:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Code-barres produit (EAN)</label>
                <input className="form-input" value={form.code_barre} placeholder="EAN13..." onChange={e => setForm({...form, code_barre:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Réf. lot (auto si vide)</label>
                <input className="form-input" value={form.num_id} placeholder="LOT-XXXXXX" onChange={e => setForm({...form, num_id:e.target.value})} />
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">Emplacement Réserve (coderange)</label>
                <input className="form-input" value={form.coderange} placeholder="Ex: A-03-R2" onChange={e => setForm({...form, coderange:e.target.value})} />
              </div>
            </div>

            <div style={{ padding:10, background:'var(--g1)', borderRadius:8, fontSize:12, color:'var(--t2)', marginBottom:14 }}>
              ℹ️ Le produit sera enregistré à la <strong>Réserve</strong>. Les étiquettes (6×4cm) s'impriment automatiquement. Pour un lot avec des dates différentes, faites une réception par date.
            </div>

            <button className="btn btn-primary btn-lg" style={{ width:'100%' }}
              onClick={handleReception} disabled={recepLoading}>
              {recepLoading ? '⏳ Enregistrement...' : `✅ Enregistrer à la Réserve${form.quantite?` (${form.quantite} étiquette${parseInt(form.quantite)>1?'s':''})`:''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── LOCALISATION ── */}
      {tab === 'recherche' && (
        <div style={{ maxWidth:700 }}>
          <div className="card" style={{ marginBottom:14 }}>
            <h4 style={{ marginBottom:10 }}>🔍 Localiser un produit</h4>
            <input className="form-input" placeholder="Nom, code-barres ou référence lot..."
              value={rechercheQ} onChange={e => handleRecherche(e.target.value)} autoFocus />
          </div>
          {rechercheRes.length > 0 && (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Produit</th><th>Ref. Lot</th><th>Emplacement Réserve</th><th>Emplacement Rayon</th><th>Stock</th><th>Statut</th><th>Péremption</th></tr>
                  </thead>
                  <tbody>
                    {rechercheRes.map((p, i) => {
                      const jours = p.date_peremption ? Math.floor((new Date(p.date_peremption) - new Date()) / 86400000) : null
                      return (
                        <tr key={p.id||i}>
                          <td><div style={{ display:'flex', alignItems:'center', gap:8 }}><span style={{ fontSize:18 }}>{p.emoji||'💊'}</span><div><div style={{ fontWeight:600 }}>{p.nom}</div></div></div></td>
                          <td style={{ fontFamily:'monospace', fontSize:11 }}>{p.num_id||'—'}</td>
                          <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--blue4)' }}>{p.coderange||<span style={{ color:'var(--t3)' }}>—</span>}</td>
                          <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--g4)' }}>{p.coderayon||<span style={{ color:'var(--t3)' }}>—</span>}</td>
                          <td style={{ fontWeight:700 }}>{p.stock_reserve??p.quantite??0}</td>
                          <td><span className={`badge ${p.statut==='rayon'?'badge-green':'badge-blue'}`}>{p.statut==='rayon'?'🏪 Rayon':'🏭 Réserve'}</span></td>
                          <td>{jours!==null?<span style={{ fontSize:12, fontWeight:600, color:jours<0?'var(--danger2)':jours<30?'var(--warn2)':'var(--t3)' }}>{jours<0?'⛔ Expiré':`J-${jours}`}</span>:'—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {rechercheQ.length >= 2 && rechercheRes.length === 0 && (
            <div className="card" style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>
              Aucun produit trouvé pour « {rechercheQ} »
            </div>
          )}
        </div>
      )}

      {/* ── HISTORIQUE ── */}
      {tab === 'historique' && (
        <div className="card">
          <h4 style={{ marginBottom:14 }}>📋 Historique des mouvements</h4>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Produit</th><th>Type</th><th>Qté</th><th>Avant</th><th>Après</th><th>Staff</th><th>Note</th></tr>
              </thead>
              <tbody>
                {mouvements.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize:12, color:'var(--t3)', whiteSpace:'nowrap' }}>
                      {new Date(m.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td><div style={{ display:'flex', alignItems:'center', gap:6 }}><span>{m.produits?.emoji}</span><span style={{ fontWeight:600 }}>{m.produits?.nom}</span></div></td>
                    <td>
                      <span className={`badge ${
                        m.type_mvt==='entree_reserve'||m.type_mvt==='entree'?'badge-green':
                        m.type_mvt==='reserve_vers_rayon'?'badge-blue':
                        m.type_mvt==='vente'?'badge-amber':
                        m.type_mvt==='retour_client'?'badge-green':'badge-gray'
                      }`}>{m.type_mvt}</span>
                    </td>
                    <td style={{ fontWeight:700 }}>{m.quantite}</td>
                    <td style={{ color:'var(--t3)' }}>{m.stock_avant??'—'}</td>
                    <td style={{ fontWeight:600, color:(m.stock_apres??0)<5?'var(--danger2)':'var(--g4)' }}>{m.stock_apres??'—'}</td>
                    <td style={{ fontSize:12, color:'var(--t3)' }}>{m.staff?.prenom} {m.staff?.nom}</td>
                    <td style={{ fontSize:12, color:'var(--t3)' }}>{m.notes||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}