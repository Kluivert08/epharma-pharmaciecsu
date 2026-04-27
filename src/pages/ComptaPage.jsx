import React, { useEffect, useState, useContext } from 'react'
import { AuthContext } from '../App'
import { getEcritures, addEcriture, syncVentesVersCompta, supabase } from '../lib/supabase'

// ── Utilitaires export ────────────────────────────────────────
function exportCSV(ecritures, filename) {
  const headers = ['Date','Type','Catégorie','Description','Montant (FCFA)']
  const rows = ecritures.map(e => [
    new Date(e.date_ecriture).toLocaleDateString('fr-FR'),
    e.type_ecriture, e.categorie, e.description || '',
    e.type_ecriture === 'recette' ? e.montant : -e.montant,
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = filename; a.click()
}

function exportRapportHTML(ecritures, periode, recettes, depenses, solde, staff) {
  const rows = ecritures.map(e => `
    <tr>
      <td>${new Date(e.date_ecriture).toLocaleDateString('fr-FR')}</td>
      <td><span class="${e.type_ecriture}">${e.type_ecriture}</span></td>
      <td>${e.categorie}</td>
      <td>${e.description || '—'}</td>
      <td style="text-align:right;font-weight:700;color:${e.type_ecriture==='recette'?'#2E7D32':'#C62828'}">
        ${e.type_ecriture==='recette'?'+':'-'}${e.montant?.toLocaleString('fr-FR')} F
      </td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Rapport comptable — ${periode}</title>
<style>
  body { font-family:'Segoe UI',sans-serif; margin:40px; color:#1a2e1a; }
  h1 { color:#1B5E20; font-size:22px; margin:0; }
  .subtitle { color:#7A9E7A; font-size:13px; margin-bottom:28px; }
  .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:28px; }
  .stat { background:#F0F7EE; border-radius:10px; padding:14px; }
  .stat-label { font-size:11px; font-weight:600; color:#7A9E7A; text-transform:uppercase; margin-bottom:4px; }
  .stat-value { font-size:22px; font-weight:700; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { background:#F0F7EE; padding:10px 12px; text-align:left; font-size:11px; font-weight:600; color:#7A9E7A; text-transform:uppercase; border-bottom:2px solid #C8E6C0; }
  td { padding:10px 12px; border-bottom:1px solid #E8F0E8; }
  .recette { background:#E8F5E9; color:#1B5E20; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; }
  .depense { background:#FFEBEE; color:#C62828; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; }
  .footer { margin-top:28px; font-size:11px; color:#7A9E7A; text-align:center; padding-top:12px; border-top:1px solid #E8F0E8; }
</style></head><body>
  <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px">
    <div style="width:48px;height:48px;background:#1B5E20;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px">✚</div>
    <div><h1>Rapport comptable — ${periode}</h1>
    <div class="subtitle">Pharmacie CSU · Exporté par ${staff?.prenom} ${staff?.nom} · ${new Date().toLocaleString('fr-FR')}</div></div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-label">Recettes</div><div class="stat-value" style="color:#2E7D32">+${recettes.toLocaleString('fr-FR')} FCFA</div></div>
    <div class="stat"><div class="stat-label">Dépenses</div><div class="stat-value" style="color:#C62828">-${depenses.toLocaleString('fr-FR')} FCFA</div></div>
    <div class="stat"><div class="stat-label">Solde</div><div class="stat-value" style="color:${solde>=0?'#2E7D32':'#C62828'}">${solde>=0?'+':''}${solde.toLocaleString('fr-FR')} FCFA</div></div>
  </div>
  <table><thead><tr><th>Date</th><th>Type</th><th>Catégorie</th><th>Description</th><th>Montant</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="footer">ePharma · ${ecritures.length} écriture(s)</div>
</body></html>`

  window.open(URL.createObjectURL(new Blob([html], { type:'text/html;charset=utf-8;' })), '_blank')
}

// ── Page Comptabilité ─────────────────────────────────────────
export default function ComptaPage() {
  const { staff } = useContext(AuthContext)

  const [ecritures,  setEcritures]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [syncing,    setSyncing]    = useState(false)
  const [syncMsg,    setSyncMsg]    = useState(null)
  const [sendingReport, setSendingReport] = useState(false)
  const [reportMsg,  setReportMsg]  = useState(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportMois,  setReportMois]  = useState(() => {
    const d = new Date()
    const m = d.getMonth() === 0 ? 12 : d.getMonth()
    const a = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
    return `${a}-${String(m).padStart(2,'0')}`
  })

  const [filtre,     setFiltre]     = useState('mois')
  const [dateJour,   setDateJour]   = useState(new Date().toISOString().slice(0,10))
  const [dateMois,   setDateMois]   = useState(new Date().toISOString().slice(0,7))
  const [dateDebut,  setDateDebut]  = useState('')
  const [dateFin,    setDateFin]    = useState('')

  const [form, setForm] = useState({
    type_ecriture:'depense', categorie:'', montant:'', description:'',
    date_ecriture: new Date().toISOString().slice(0,10),
  })

  useEffect(() => { loadData() }, [filtre, dateJour, dateMois, dateDebut, dateFin])

  async function loadData() {
    setLoading(true)
    let debut, fin

    if (filtre === 'jour')       { debut = dateJour; fin = dateJour }
    else if (filtre === 'mois')  { debut = `${dateMois}-01`; fin = `${dateMois}-31` }
    else                         { debut = dateDebut; fin = dateFin }

    if (!debut && !fin && filtre === 'periode') { setLoading(false); return }

    let q = supabase.from('ecritures_comptables').select('*').order('date_ecriture', { ascending:false })
    if (debut) q = q.gte('date_ecriture', debut)
    if (fin)   q = q.lte('date_ecriture', fin)

    const { data } = await q.limit(500)
    setEcritures(data ?? [])
    setLoading(false)
  }

  async function handleSync() {
    setSyncing(true); setSyncMsg(null)
    const { inserted, error } = await syncVentesVersCompta()
    if (error) {
      setSyncMsg({ type:'error', text: 'Erreur : ' + error.message })
    } else {
      setSyncMsg({ type:'success', text: inserted > 0
        ? `✅ ${inserted} vente(s) importée(s) dans la comptabilité`
        : '✅ Tout est déjà synchronisé' })
      loadData()
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(null), 4000)
  }

  async function handleAdd() {
    if (!form.categorie || !form.montant) return
    await addEcriture({ ...form, montant:parseInt(form.montant), staff_id:staff.id })
    setShowModal(false)
    setForm({ type_ecriture:'depense', categorie:'', montant:'', description:'', date_ecriture:new Date().toISOString().slice(0,10) })
    loadData()
  }

  // ── Envoyer rapport par email ──────────────────────────────
  async function handleSendReport() {
    setSendingReport(true)
    setReportMsg(null)
    try {
      const [annee, mois] = reportMois.split('-').map(Number)
      const { data, error } = await supabase.functions.invoke('generate-monthly-report', {
        body: { annee, mois },
      })
      if (error) throw error
      setReportMsg({
        type: 'success',
        text: `✅ Rapport ${data.periode} envoyé à admin@pharmaciecsu.cg — CA: ${data.stats?.ca_total?.toLocaleString('fr-FR')} FCFA`,
      })
    } catch (e) {
      setReportMsg({ type:'error', text:`Erreur: ${e.message}` })
    }
    setSendingReport(false)
  }

  const recettes = ecritures.filter(e=>e.type_ecriture==='recette').reduce((s,e)=>s+e.montant,0)
  const depenses = ecritures.filter(e=>e.type_ecriture==='depense').reduce((s,e)=>s+e.montant,0)
  const solde    = recettes - depenses

  function getPeriodeLabel() {
    if (filtre==='jour')          return `Journée du ${new Date(dateJour).toLocaleDateString('fr-FR')}`
    if (filtre==='mois')          return `Mois de ${new Date(dateMois+'-01').toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}`
    if (dateDebut && dateFin)     return `Du ${new Date(dateDebut).toLocaleDateString('fr-FR')} au ${new Date(dateFin).toLocaleDateString('fr-FR')}`
    return 'Période personnalisée'
  }

  return (
    <div>
      {syncMsg && (
        <div className={`alert ${syncMsg.type==='success'?'alert-success':'alert-error'}`} style={{ marginBottom:14 }}>
          {syncMsg.text}
        </div>
      )}
      {/* Filtres + actions */}
      <div className="card" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div>
            <div className="form-label">Période</div>
            <div style={{ display:'flex', gap:6 }}>
              {['jour','mois','periode'].map(f => (
                <button key={f} className={`btn ${filtre===f?'btn-primary':'btn-outline'} btn-sm`} onClick={() => setFiltre(f)}>
                  {f==='jour'?'📅 Jour':f==='mois'?'📆 Mois':'📊 Période libre'}
                </button>
              ))}
            </div>
          </div>
          {filtre==='jour' && (
            <div><div className="form-label">Date</div>
              <input className="form-input" type="date" value={dateJour} onChange={e=>setDateJour(e.target.value)} style={{ width:180 }} /></div>
          )}
          {filtre==='mois' && (
            <div><div className="form-label">Mois</div>
              <input className="form-input" type="month" value={dateMois} onChange={e=>setDateMois(e.target.value)} style={{ width:180 }} /></div>
          )}
          {filtre==='periode' && (
            <>
              <div><div className="form-label">Du</div>
                <input className="form-input" type="date" value={dateDebut} onChange={e=>setDateDebut(e.target.value)} style={{ width:160 }} /></div>
              <div><div className="form-label">Au</div>
                <input className="form-input" type="date" value={dateFin} onChange={e=>setDateFin(e.target.value)} style={{ width:160 }} /></div>
            </>
          )}
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <button className="btn btn-outline btn-sm"
              onClick={handleSync} disabled={syncing}
              title="Importer les ventes encaissées manquantes">
              {syncing ? '⏳' : '🔄'} Sync ventes
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => exportCSV(ecritures, `compta-${filtre}-${Date.now()}.csv`)}>
              📥 CSV
            </button>
            <button className="btn btn-outline btn-sm"
              onClick={() => exportRapportHTML(ecritures, getPeriodeLabel(), recettes, depenses, solde, staff)}>
              🖨️ Rapport
            </button>
            <button className="btn btn-outline btn-sm" style={{ color:'#6A1B9A', borderColor:'#6A1B9A' }}
              onClick={() => setShowReportModal(true)}>
              📧 Envoyer par email
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ Écriture</button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid-3" style={{ marginBottom:20 }}>
        <div className="stat-card fade-in">
          <div className="stat-label">Recettes · {getPeriodeLabel()}</div>
          <div className="stat-value" style={{ color:'var(--g4)' }}>+{recettes.toLocaleString('fr-FR')} F</div>
          <div className="stat-sub">{ecritures.filter(e=>e.type_ecriture==='recette').length} écritures</div>
        </div>
        <div className="stat-card fade-in stagger-1">
          <div className="stat-label">Dépenses</div>
          <div className="stat-value" style={{ color:'var(--danger2)' }}>-{depenses.toLocaleString('fr-FR')} F</div>
          <div className="stat-sub">{ecritures.filter(e=>e.type_ecriture==='depense').length} écritures</div>
        </div>
        <div className="stat-card fade-in stagger-2">
          <div className="stat-label">Solde net</div>
          <div className="stat-value" style={{ color:solde>=0?'var(--g4)':'var(--danger2)' }}>
            {solde>=0?'+':''}{solde.toLocaleString('fr-FR')} F
          </div>
          <div className="stat-sub">{ecritures.length} écritures au total</div>
        </div>
      </div>

      {/* Tableau */}
      <div className="card">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h4>Écritures — {getPeriodeLabel()}</h4>
          <span style={{ fontSize:12, color:'var(--t3)' }}>{ecritures.length} ligne{ecritures.length>1?'s':''}</span>
        </div>
        {loading ? <div className="loader"><div className="spinner" /></div> :
          ecritures.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'var(--t3)' }}>Aucune écriture pour cette période</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Type</th><th>Catégorie</th><th>Description</th><th style={{ textAlign:'right' }}>Montant</th></tr></thead>
                <tbody>
                  {ecritures.map(e => (
                    <tr key={e.id}>
                      <td style={{ fontSize:12, color:'var(--t3)', whiteSpace:'nowrap' }}>{new Date(e.date_ecriture).toLocaleDateString('fr-FR')}</td>
                      <td><span className={`badge ${e.type_ecriture==='recette'?'badge-green':'badge-red'}`}>{e.type_ecriture}</span></td>
                      <td style={{ fontWeight:500 }}>{e.categorie}</td>
                      <td style={{ color:'var(--t2)', fontSize:13 }}>{e.description||'—'}</td>
                      <td style={{ textAlign:'right', fontFamily:'Sora', fontWeight:700, color:e.type_ecriture==='recette'?'var(--g4)':'var(--danger2)', whiteSpace:'nowrap' }}>
                        {e.type_ecriture==='recette'?'+':'-'}{e.montant?.toLocaleString('fr-FR')} F
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop:'2px solid var(--border)' }}>
                    <td colSpan={4} style={{ padding:'12px 14px', fontWeight:700, fontSize:14 }}>Solde période</td>
                    <td style={{ padding:'12px 14px', textAlign:'right', fontFamily:'Sora', fontSize:18, fontWeight:700, color:solde>=0?'var(--g4)':'var(--danger2)' }}>
                      {solde>=0?'+':''}{solde.toLocaleString('fr-FR')} FCFA
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
      </div>

      {/* Modal envoyer rapport par email */}
      {showReportModal && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setShowReportModal(false) }}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">📧 Envoyer le rapport par email</div>
              <button className="modal-close" onClick={() => setShowReportModal(false)}>✕</button>
            </div>
            <div style={{ padding:14, background:'var(--g1)', borderRadius:10, marginBottom:16, fontSize:13, color:'var(--t2)', lineHeight:1.6 }}>
              Le rapport sera envoyé à <strong>admin@pharmaciecsu.cg</strong> et contiendra :
              CA total · Répartition paiements · Top produits · État stock · Créances assurances · Résumé comptable
            </div>
            {reportMsg && (
              <div className={`alert alert-${reportMsg.type==='success'?'success':'error'}`} style={{ marginBottom:14 }}>
                {reportMsg.text}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Mois du rapport</label>
              <input className="form-input" type="month" value={reportMois}
                onChange={e => setReportMois(e.target.value)} />
            </div>
            <div style={{ fontSize:12, color:'var(--t3)', marginBottom:16 }}>
              ⚙️ Les rapports sont aussi envoyés automatiquement le 1er de chaque mois à minuit
            </div>
            <button className="btn btn-primary btn-lg" style={{ width:'100%', background:'#6A1B9A' }}
              onClick={handleSendReport} disabled={sendingReport}>
              {sendingReport ? '⏳ Génération et envoi...' : '📧 Envoyer le rapport maintenant'}
            </button>
          </div>
        </div>
      )}

      {/* Modal nouvelle écriture */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) setShowModal(false) }}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Nouvelle écriture comptable</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-input form-select" value={form.type_ecriture} onChange={e=>setForm({...form,type_ecriture:e.target.value})}>
                <option value="recette">Recette</option>
                <option value="depense">Dépense</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Catégorie</label>
              <input className="form-input" value={form.categorie} onChange={e=>setForm({...form,categorie:e.target.value})} placeholder="loyer, salaire, achat..." />
            </div>
            <div className="form-group">
              <label className="form-label">Montant (FCFA)</label>
              <input className="form-input" type="number" value={form.montant} onChange={e=>setForm({...form,montant:e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Détail optionnel" />
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={form.date_ecriture} onChange={e=>setForm({...form,date_ecriture:e.target.value})} />
            </div>
            <button className="btn btn-primary btn-lg" style={{ width:'100%' }} onClick={handleAdd}>Enregistrer</button>
          </div>
        </div>
      )}
    </div>
  )
}
