import React, { useEffect, useState, useContext, useRef } from 'react'
import { getCommandesPOSEnAttente, encaisserCommande, annulerCommande, ecouterCommandesPOS } from '../lib/supabase'
import { AuthContext } from '../App'


// ── Impression reçu 180mm ─────────────────────────────────────
function imprimerRecu(commande, modePaiement) {
  const articles = commande.articles || []
  const sousTotal = articles.reduce((s, a) => s + (a.prix * a.quantite), 0)
  const total     = commande.total || sousTotal
  // TVA 18% et CA 5% calculés sur le sous-total HT implicite
  // PrixTTC = PrixHT * (1 + TVA/100 + CA_TVA/100)
  // On affiche TVA et CA tels qu'inclus dans les prix TTC
  const tauxTVA   = 18
  const tauxCA    = 5  // % de TVA
  const htImplicite = sousTotal / (1 + tauxTVA / 100 * (1 + tauxCA / 100))
  const montantTVA  = Math.round(htImplicite * tauxTVA / 100)
  const montantCA   = Math.round(montantTVA * tauxCA / 100)
  const montantAss  = commande.montant_assurance || 0

  const lignes = articles.map(a => `
    <tr>
      <td style="padding:3px 0">${a.emoji || ''} ${a.nom}</td>
      <td style="text-align:center;padding:3px 4px">${a.quantite}</td>
      <td style="text-align:right;padding:3px 0">${(a.prix * a.quantite).toLocaleString('fr-FR')}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Reçu ${commande.numero}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm 3mm; }
    body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; width: 74mm; margin: 0 auto; }
    .center { text-align: center; }
    .bold   { font-weight: 700; }
    .sep    { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    table   { width: 100%; border-collapse: collapse; font-size: 11px; }
    th      { text-align: left; font-size: 10px; border-bottom: 1px solid #000; padding-bottom: 3px; }
    .total-row td { border-top: 1px dashed #000; padding-top: 4px; font-weight: 700; font-size: 13px; }
    .footer { font-size: 10px; margin-top: 10px; text-align: center; color: #555; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:14px;margin-bottom:2px">✚ PHARMACIE CSU</div>
  <div class="center" style="font-size:10px">Brazzaville · Tel: +242 06 000 00 00</div>
  <hr class="sep">
  <div style="font-size:10px">
    <div>Reçu N° : <strong>${commande.numero}</strong></div>
    <div>Date    : ${new Date().toLocaleString('fr-FR')}</div>
    <div>Caisse  : ${commande.caissiere || '—'}</div>
    ${commande.client_nom ? `<div>Client  : ${commande.client_nom}</div>` : ''}
    ${commande.nom_assure ? `<div>Assuré  : ${commande.nom_assure} (${commande.assurance || ''})</div>` : ''}
  </div>
  <hr class="sep">
  <table>
    <thead><tr><th>Article</th><th style="text-align:center">Qté</th><th style="text-align:right">Montant</th></tr></thead>
    <tbody>${lignes}</tbody>
  </table>
  <hr class="sep">
  <table>
    <tbody>
      <tr><td>Sous-total</td><td style="text-align:right">${sousTotal.toLocaleString('fr-FR')} F</td></tr>
      <tr><td style="font-size:10px">TVA ${tauxTVA}%</td><td style="text-align:right;font-size:10px">${montantTVA.toLocaleString('fr-FR')} F</td></tr>
      <tr><td style="font-size:10px">CA (${tauxCA}% TVA)</td><td style="text-align:right;font-size:10px">${montantCA.toLocaleString('fr-FR')} F</td></tr>
      ${montantAss > 0 ? `<tr><td style="font-size:10px">Part assurance</td><td style="text-align:right;font-size:10px">−${montantAss.toLocaleString('fr-FR')} F</td></tr>` : ''}
      <tr class="total-row"><td>TOTAL</td><td style="text-align:right;font-size:15px">${total.toLocaleString('fr-FR')} FCFA</td></tr>
    </tbody>
  </table>
  <hr class="sep">
  <div style="font-size:10px;margin-bottom:6px">
    Paiement : <strong>${modePaiement?.replace('_',' ').toUpperCase() || '—'}</strong>
  </div>
  <div class="footer">
    Merci pour votre visite !<br>
    Conservez ce reçu comme justificatif.
  </div>
</body>
</html>`

  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 300)
}

const PAIEMENTS = [
  { id: 'mtn_momo',     label: 'MTN MoMo',    icon: '📱', color: '#FFC107' },
  { id: 'airtel_money', label: 'Airtel Money', icon: '📲', color: '#E53935' },
  { id: 'visa',         label: 'Carte Visa',   icon: '💳', color: '#1565C0' },
  { id: 'especes',      label: 'Espèces',      icon: '💵', color: '#2E7D32' },
]

export default function CaissePage() {
  const { staff }                       = useContext(AuthContext)
  const [commandes,    setCommandes]    = useState([])
  const [selected,     setSelected]     = useState(null)
  const [modePay,      setModePay]      = useState('especes')
  const [refPay,       setRefPay]       = useState('')
  const [loading,      setLoading]      = useState(false)
  const [loadingData,  setLoadingData]  = useState(true)
  const [nouvelleCmd,  setNouvelleCmd]  = useState(false)
  const channelRef = useRef(null)

  useEffect(() => {
    loadCommandes()

    // Realtime — nouvelles commandes en temps réel
    channelRef.current = ecouterCommandesPOS(() => {
      loadCommandes()
      setNouvelleCmd(true)
      setTimeout(() => setNouvelleCmd(false), 3000)
    })

    return () => {
      if (channelRef.current) channelRef.current.unsubscribe()
    }
  }, [])

  async function loadCommandes() {
    const data = await getCommandesPOSEnAttente()
    setCommandes(data)
    setLoadingData(false)
  }

  async function handleEncaisser() {
    if (!selected) return
    setLoading(true)
    await encaisserCommande(selected.id, staff.id, modePay, refPay || null)
    // Imprimer le reçu avec les infos de la commande
    imprimerRecu(selected, modePay)
    setSelected(null); setModePay('especes'); setRefPay('')
    setLoading(false)
    loadCommandes()
  }

  async function handleAnnuler(cmdId) {
    if (!confirm('Annuler cette commande ?')) return
    await annulerCommande(cmdId)
    if (selected?.id === cmdId) setSelected(null)
    loadCommandes()
  }

  const tempsAttente = (cmd) => {
    const diff = (Date.now() - new Date(cmd.created_at)) / 1000 / 60
    if (diff < 1)  return 'À l\'instant'
    if (diff < 60) return `${Math.floor(diff)} min`
    return `${Math.floor(diff / 60)}h`
  }

  if (loadingData) return <div className="loader"><div className="spinner" /></div>

  return (
    <div>
      {nouvelleCmd && (
        <div className="alert alert-warn" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🔔</span>
          <strong>Nouvelle commande reçue d'une vendeuse !</strong>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 20, height: 'calc(100vh - 120px)' }}>

        {/* Liste des commandes en attente */}
        <div style={{ overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>
              Commandes en attente
              {commandes.length > 0 && (
                <span className="badge badge-amber" style={{ marginLeft: 10 }}>{commandes.length}</span>
              )}
            </h3>
            <button className="btn btn-outline btn-sm" onClick={loadCommandes}>🔄 Actualiser</button>
          </div>

          {commandes.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--t3)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>Aucune commande en attente</div>
              <div style={{ fontSize: 13 }}>Les commandes des vendeuses apparaissent ici en temps réel</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {commandes.map(cmd => (
                <div key={cmd.id}
                  className="card"
                  style={{
                    cursor: 'pointer',
                    borderColor: selected?.id === cmd.id ? 'var(--g3)' : 'var(--border)',
                    borderWidth: selected?.id === cmd.id ? 2 : 1,
                    background: selected?.id === cmd.id ? 'var(--g1)' : 'var(--card)',
                    transition: 'all .15s',
                  }}
                  onClick={() => { setSelected(cmd); setModePay('especes'); setRefPay('') }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'Sora', fontSize: 18, fontWeight: 700, color: 'var(--g4)' }}>
                          {cmd.numero}
                        </span>
                        <span className={`badge ${cmd.statut==='en_attente'?'badge-amber':'badge-blue'}`}>
                          {cmd.statut === 'en_attente' ? '⏳ En attente' : '🔄 En cours'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                        Par <strong>{cmd.vendeuse}</strong> · {tempsAttente(cmd)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'Sora', fontSize: 20, fontWeight: 700, color: 'var(--g4)' }}>
                        {cmd.total?.toLocaleString('fr-FR')} F
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>{cmd.nb_articles} article{cmd.nb_articles > 1 ? 's' : ''}</div>
                    </div>
                  </div>

                  {/* Articles résumé */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {cmd.articles?.slice(0, 4).map((a, i) => (
                      <span key={i} style={{ background: 'var(--g1)', borderRadius: 6, padding: '3px 8px', fontSize: 12, color: 'var(--t2)' }}>
                        {a.emoji} {a.nom} × {a.quantite}
                      </span>
                    ))}
                    {cmd.articles?.length > 4 && (
                      <span style={{ fontSize: 12, color: 'var(--t3)' }}>+{cmd.articles.length - 4} autres</span>
                    )}
                  </div>

                  {cmd.client_nom && (
                    <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                      👤 {cmd.client_nom}{cmd.client_tel ? ` · ${cmd.client_tel}` : ''}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                      onClick={e => { e.stopPropagation(); setSelected(cmd); setModePay('especes'); setRefPay('') }}>
                      💳 Encaisser
                    </button>
                    <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger2)', borderColor: 'var(--danger2)' }}
                      onClick={e => { e.stopPropagation(); handleAnnuler(cmd.id) }}>
                      ✕ Annuler
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel encaissement */}
        <div style={{ position: 'sticky', top: 0 }}>
          {!selected ? (
            <div className="card" style={{ textAlign: 'center', padding: 60, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👈</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>Sélectionnez une commande</div>
              <div style={{ fontSize: 13, color: 'var(--t3)' }}>Cliquez sur une commande pour l'encaisser</div>
            </div>
          ) : (
            <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontFamily: 'Sora', fontSize: 20, fontWeight: 700, color: 'var(--g4)' }}>{selected.numero}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>Par {selected.vendeuse}</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setSelected(null)}>✕</button>
              </div>

              {/* Détail articles */}
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
                {selected.articles?.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 20 }}>{a.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>{a.prix?.toLocaleString('fr-FR')} F × {a.quantite}</div>
                    </div>
                    <div style={{ fontFamily: 'Sora', fontSize: 14, fontWeight: 700, color: 'var(--g4)' }}>
                      {a.total?.toLocaleString('fr-FR')} F
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Total à encaisser</span>
                <span style={{ fontFamily: 'Sora', fontSize: 24, fontWeight: 700, color: 'var(--g4)' }}>
                  {selected.total?.toLocaleString('fr-FR')} FCFA
                </span>
              </div>

              {/* Mode paiement */}
              <div style={{ marginBottom: 14 }}>
                <div className="form-label" style={{ marginBottom: 8 }}>Mode de paiement</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {PAIEMENTS.map(p => (
                    <button key={p.id} onClick={() => setModePay(p.id)}
                      style={{
                        padding: '10px 12px', borderRadius: 10, border: '2px solid',
                        borderColor: modePay === p.id ? p.color : 'var(--border)',
                        background: modePay === p.id ? `${p.color}18` : '#fff',
                        cursor: 'pointer', fontFamily: 'Plus Jakarta Sans', fontSize: 12,
                        fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                        color: 'var(--t1)', transition: 'all .15s',
                      }}>
                      <span style={{ fontSize: 16 }}>{p.icon}</span> {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {(modePay === 'mtn_momo' || modePay === 'airtel_money') && (
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">Référence transaction</label>
                  <input className="form-input" placeholder="TXN123456789"
                    value={refPay} onChange={e => setRefPay(e.target.value)} />
                </div>
              )}

              {modePay === 'visa' && (
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">N° d'autorisation</label>
                  <input className="form-input" placeholder="Auth: XXXXXX"
                    value={refPay} onChange={e => setRefPay(e.target.value)} />
                </div>
              )}

              <button className="btn btn-primary btn-lg" style={{ width: '100%', fontSize: 16 }}
                onClick={handleEncaisser} disabled={loading}>
                {loading ? '⏳ Traitement...' : `✅ Confirmer — ${selected.total?.toLocaleString('fr-FR')} FCFA`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
