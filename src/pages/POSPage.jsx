import React, { useEffect, useState, useContext, useRef } from 'react'
import { getProduits, getCategories, creerCommandePOS, supabase } from '../lib/supabase'
import { AuthContext } from '../App'
import QRScanner from '../components/QRScanner'

// ── Vérification péremption ───────────────────────────────────
async function verifierPeremption(nomProduit) {
  const { data } = await supabase
    .from('v_stock_peremption')
    .select('*')
    .ilike('nom', `%${nomProduit}%`)
    .order('date_peremption', { ascending: true })
  return data ?? []
}

async function getProduitByNumId(numId) {
  const { data } = await supabase
    .from('produits')
    .select('*, categories(slug, nom_fr, emoji)')
    .eq('num_id', numId.trim())
    .eq('actif', true)
    .maybeSingle()
  return data
}

// ── Alerte péremption ─────────────────────────────────────────
function AlertePeremption({ alertes, onClose, onConfirm }) {
  const expire        = alertes.filter(a => a.statut_peremption === 'expire')
  const expireBientot = alertes.filter(a => a.statut_peremption === 'expire_bientot')
  const attention     = alertes.filter(a => a.statut_peremption === 'attention')

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">⚠️ Alerte péremption</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {expire.length > 0 && (
          <div style={{ background: 'var(--danger)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: 'var(--danger2)', marginBottom: 8 }}>
              ⛔ Produit(s) EXPIRÉ(S) en stock
            </div>
            {expire.map(a => (
              <div key={a.id} style={{ fontSize: 13, color: 'var(--danger2)', marginBottom: 4 }}>
                {a.emoji} {a.nom} · Expiré le {new Date(a.date_peremption).toLocaleDateString('fr-FR')} · {a.stock} unité{a.stock > 1 ? 's' : ''}
              </div>
            ))}
          </div>
        )}

        {expireBientot.length > 0 && (
          <div style={{ background: 'var(--warn)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: 'var(--warn2)', marginBottom: 8 }}>
              🟡 Expire dans moins de 30 jours
            </div>
            {expireBientot.map(a => (
              <div key={a.id} style={{ fontSize: 13, color: 'var(--warn2)', marginBottom: 4 }}>
                {a.emoji} {a.nom} · Expire le {new Date(a.date_peremption).toLocaleDateString('fr-FR')} · J-{a.jours_restants}
              </div>
            ))}
          </div>
        )}

        {attention.length > 0 && (
          <div style={{ background: 'var(--amber1)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: 'var(--amber4)', marginBottom: 8 }}>
              🟠 Attention — expire dans moins de 90 jours
            </div>
            {attention.map(a => (
              <div key={a.id} style={{ fontSize: 13, color: 'var(--amber4)', marginBottom: 4 }}>
                {a.emoji} {a.nom} · Expire le {new Date(a.date_peremption).toLocaleDateString('fr-FR')} · J-{a.jours_restants}
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16, padding: 12, background: 'var(--g1)', borderRadius: 10 }}>
          💡 Privilégiez les produits avec la date de péremption la plus proche pour limiter les pertes.
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>
            ✕ Annuler la sélection
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onConfirm}>
            ✅ Ajouter quand même
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Popup identification assuré ───────────────────────────────
function PopupAssure({ assurances, onIdentified, onClose }) {
  const [step,             setStep]             = useState('assurance')
  const [assuranceChoisie, setAssuranceChoisie] = useState(null)
  const [serviceChoisi,    setServiceChoisi]    = useState(null)
  const [methode,          setMethode]          = useState(null)
  const [assureData,       setAssureData]       = useState(null)
  const [loading,          setLoading]          = useState(false)

  const METHODES = [
    { id: 'qr',  label: 'Scanner QR Code', icon: '📷', desc: 'Scanner la carte d\'assuré' },
    { id: 'sms', label: 'Vérification SMS', icon: '📱', desc: 'Code par téléphone' },
  ]

  async function handleQRScan(numeroAssure) {
    if (!numeroAssure) return
    setLoading(true)
    await new Promise(r => setTimeout(r, 1200))
    setLoading(false)
    setAssureData({ numero_assure: numeroAssure, nom: 'Jean-Pierre', prenom: 'Koubemba', telephone: '+242 06 812 34 56' })
    setStep('confirme')
  }

  function handleConfirm() {
    onIdentified({ assurance: assuranceChoisie, service: serviceChoisi, assure: assureData })
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-title">Identification assuré</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {step === 'assurance' && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 14 }}>Sélectionnez l'assurance partenaire active :</div>
            {assurances.filter(a => a.active).length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--danger2)', background: 'var(--danger)', borderRadius: 10 }}>
                ⚠️ Aucune assurance active. Contactez l'administrateur.
              </div>
            ) : (
              assurances.filter(a => a.active).map(a => (
                <button key={a.id}
                  onClick={() => { setAssuranceChoisie(a); setServiceChoisi(a.assurance_services?.[0] || null); setStep('methode') }}
                  style={{ width: '100%', padding: 14, borderRadius: 12, border: '2px solid var(--border)', background: '#fff', cursor: 'pointer', textAlign: 'left', marginBottom: 10, fontFamily: 'Plus Jakarta Sans' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>🏥 {a.nom}</div>
                  {a.assurance_services?.map(s => (
                    <div key={s.id} style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                      {s.nom_service} · {s.taux_couverture}% pris en charge
                    </div>
                  ))}
                </button>
              ))
            )}
          </div>
        )}

        {step === 'methode' && (
          <div>
            <div style={{ padding: 10, background: 'var(--g1)', borderRadius: 10, marginBottom: 14, fontSize: 13, color: 'var(--g4)', fontWeight: 500 }}>
              🏥 {assuranceChoisie?.nom}{serviceChoisi && ` · ${serviceChoisi.nom_service} · ${serviceChoisi.taux_couverture}%`}
            </div>
            {METHODES.map(m => (
              <button key={m.id}
                onClick={() => { setMethode(m.id); setStep('identification') }}
                style={{ width: '100%', padding: 16, borderRadius: 12, border: '2px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, fontFamily: 'Plus Jakarta Sans' }}>
                <span style={{ fontSize: 28 }}>{m.icon}</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>{m.desc}</div>
                </div>
              </button>
            ))}
            <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 4 }} onClick={() => setStep('assurance')}>← Retour</button>
          </div>
        )}

        {step === 'identification' && (
          <div>
            <div style={{ padding: 10, background: 'var(--g1)', borderRadius: 10, marginBottom: 14, fontSize: 13, color: 'var(--g4)', fontWeight: 500 }}>
              🏥 {assuranceChoisie?.nom} · {methode === 'qr' ? '📷 QR Code' : '📱 SMS 2FA'}
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 30 }}>
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 13, color: 'var(--t3)' }}>Vérification en cours...</div>
              </div>
            ) : methode === 'qr' ? (
              <QRScanner onScan={handleQRScan} onClose={() => setStep('methode')} titre="Scanner la carte d'assuré" />
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--t3)' }}>SMS 2FA — fonctionnalité en cours</div>
            )}
          </div>
        )}

        {step === 'confirme' && assureData && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g4)' }}>Assuré identifié</div>
            </div>
            <div style={{ background: 'var(--g1)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: 14 }}>
              <div><span style={{ color: 'var(--t3)', fontSize: 12 }}>Nom</span><div style={{ fontWeight: 700 }}>{assureData.prenom} {assureData.nom}</div></div>
              <div><span style={{ color: 'var(--t3)', fontSize: 12 }}>N° assuré</span><div style={{ fontWeight: 700 }}>{assureData.numero_assure}</div></div>
              <div><span style={{ color: 'var(--t3)', fontSize: 12 }}>Téléphone</span><div style={{ fontWeight: 700 }}>{assureData.telephone}</div></div>
              <div><span style={{ color: 'var(--t3)', fontSize: 12 }}>Assurance</span><div style={{ fontWeight: 700, color: 'var(--g4)' }}>{assuranceChoisie?.nom}</div></div>
              <div style={{ gridColumn: '1/-1' }}>
                <span style={{ color: 'var(--t3)', fontSize: 12 }}>Service</span>
                <div style={{ fontWeight: 700 }}>{serviceChoisi?.nom_service} · <span style={{ color: 'var(--g4)' }}>{serviceChoisi?.taux_couverture}% pris en charge</span></div>
              </div>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleConfirm}>Appliquer au panier →</button>
            <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={() => setStep('assurance')}>Recommencer</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page POS principale ───────────────────────────────────────
export default function POSPage() {
  const { staff } = useContext(AuthContext)
  const [produits,       setProduits]       = useState([])
  const [categories,     setCategories]     = useState([])
  const [assurances,     setAssurances]     = useState([])
  const [curCat,         setCurCat]         = useState('all')
  const [search,         setSearch]         = useState('')
  const [panier,         setPanier]         = useState([])
  const [modeAssure,     setModeAssure]     = useState(false)
  const [showPopupAssure,setShowPopupAssure]= useState(false)
  const [assureInfo,     setAssureInfo]     = useState(null)
  const [clientNom,      setClientNom]      = useState('')
  const [clientTel,      setClientTel]      = useState('')
  const [loading,        setLoading]        = useState(false)
  const [cmdEnvoyee,     setCmdEnvoyee]     = useState(null)
  const [showQRProduit,  setShowQRProduit]  = useState(false)
  const [alertePerem,    setAlertePerem]    = useState(null)  // { alertes, produit }
  const [scanError,      setScanError]      = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [p, c] = await Promise.all([getProduits(), getCategories()])
    const { data: a } = await supabase
      .from('assurances_partenaires')
      .select('*, assurance_services(*)')
      .eq('active', true)
    setProduits(p); setCategories(c); setAssurances(a ?? [])
  }

  const filtered = produits.filter(p => {
    const matchCat    = curCat === 'all' || p.categories?.slug === curCat
    const matchSearch = !search || p.nom.toLowerCase().includes(search.toLowerCase()) || p.num_id?.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  // ── Vérifier péremption avant d'ajouter ──────────────────
  async function checkAndAdd(produit) {
    if (produit.stock <= 0) return

    // Vérifier si des produits du même nom ont une péremption problématique
    const alertes = await verifierPeremption(produit.nom)
    const problematiques = alertes.filter(a =>
      a.statut_peremption === 'expire' ||
      a.statut_peremption === 'expire_bientot' ||
      a.statut_peremption === 'attention'
    )

    if (problematiques.length > 0) {
      setAlertePerem({ alertes: problematiques, produit })
      return
    }

    addToCart(produit)
  }

  // ── Scan QR Code produit ──────────────────────────────────
  async function handleScanProduit(numId) {
    setShowQRProduit(false)
    setScanError(null)

    const produit = await getProduitByNumId(numId)
    if (!produit) {
      setScanError(`Produit introuvable : "${numId}"`)
      setTimeout(() => setScanError(null), 4000)
      return
    }
    if (produit.stock <= 0) {
      setScanError(`⛔ ${produit.nom} — rupture de stock`)
      setTimeout(() => setScanError(null), 4000)
      return
    }

    await checkAndAdd(produit)
  }

  function addToCart(produit) {
    if (produit.stock <= 0) return
    setPanier(prev => {
      const ex = prev.find(i => i.produit_id === produit.id)
      if (ex) {
        if (ex.quantite >= produit.stock) return prev
        return prev.map(i => i.produit_id === produit.id
          ? { ...i, quantite: i.quantite + 1, total_ligne: (i.quantite + 1) * i.prix_unitaire }
          : i)
      }
      return [...prev, {
        produit_id:     produit.id,
        nom:            produit.nom,
        emoji:          produit.emoji,
        prix_unitaire:  produit.prix_fcfa,
        categorie_slug: produit.categories?.slug,
        quantite:       1,
        remise_pct:     0,
        total_ligne:    produit.prix_fcfa,
        couvert:        false,
        date_peremption: produit.date_peremption,
        num_id:         produit.num_id,
      }]
    })
  }

  function changeQty(produit_id, delta) {
    setPanier(prev => prev
      .map(i => i.produit_id === produit_id
        ? { ...i, quantite: Math.max(0, i.quantite + delta), total_ligne: Math.max(0, i.quantite + delta) * i.prix_unitaire * (1 - i.remise_pct / 100) }
        : i)
      .filter(i => i.quantite > 0)
    )
  }

  function appliquerAssurance(info) {
    setAssureInfo(info)
    setClientNom(`${info.assure.prenom} ${info.assure.nom}`)
    setClientTel(info.assure.telephone)
    setShowPopupAssure(false)

    const service      = info.service
    const taux         = service?.taux_couverture ?? 0
    const catsCouvertes = service?.tous_produits ? null : service?.categories_couvertes ?? []

    setPanier(prev => prev.map(item => {
      const couvert = service?.tous_produits || catsCouvertes?.includes(item.categorie_slug)
      const remise  = couvert ? taux : 0
      return { ...item, couvert, remise_pct: remise, total_ligne: item.quantite * item.prix_unitaire * (1 - remise / 100) }
    }))
  }

  function retirerAssurance() {
    setModeAssure(false); setAssureInfo(null); setClientNom(''); setClientTel('')
    setPanier(prev => prev.map(i => ({ ...i, couvert: false, remise_pct: 0, total_ligne: i.quantite * i.prix_unitaire })))
  }

  const total          = panier.reduce((s, i) => s + i.total_ligne, 0)
  const totalSansRemise = panier.reduce((s, i) => s + i.quantite * i.prix_unitaire, 0)
  const totalAssurance  = panier.filter(i => i.couvert).reduce((s, i) => s + (i.quantite * i.prix_unitaire * (i.remise_pct / 100)), 0)

  async function handleEnvoyerCaisse() {
    if (!panier.length) return
    setLoading(true)
    const extraData = assureInfo ? {
      assurance_id:      assureInfo.assurance?.id,
      service_id:        assureInfo.service?.id,
      numero_assure:     assureInfo.assure?.numero_assure,
      nom_assure:        `${assureInfo.assure?.prenom} ${assureInfo.assure?.nom}`,
      taux_couverture:   assureInfo.service?.taux_couverture ?? 0,
      montant_assurance: Math.round(totalAssurance),
      montant_patient:   Math.round(total),
    } : {}

    const { data, error } = await creerCommandePOS(
      staff.id,
      panier.map(i => ({
        produit_id:    i.produit_id,
        quantite:      i.quantite,
        prix_unitaire: i.prix_unitaire,
        remise_pct:    i.remise_pct,
        total_ligne:   Math.round(i.total_ligne),
      })),
      { nom: clientNom, tel: clientTel },
      extraData
    )
    setLoading(false)
    if (error) { alert('Erreur: ' + error.message); return }
    setCmdEnvoyee(data)
    setPanier([]); setClientNom(''); setClientTel('')
    retirerAssurance()
  }

  // Péremption dans le panier
  const panierAvecAlerte = panier.filter(i => {
    if (!i.date_peremption) return false
    const jours = Math.floor((new Date(i.date_peremption) - new Date()) / 86400000)
    return jours < 90
  })

  return (
    <div>
      {cmdEnvoyee && (
        <div className="alert alert-success" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>✅ Commande <strong>{cmdEnvoyee.numero}</strong> envoyée à la caisse</span>
          <button className="btn btn-outline btn-sm" onClick={() => setCmdEnvoyee(null)}>Nouvelle commande</button>
        </div>
      )}

      {scanError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>{scanError}</div>
      )}

      <div className="pos-layout">
        {/* Catalogue */}
        <div className="pos-products">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input className="form-input" placeholder="🔍 Rechercher par nom ou NumId..."
              value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-outline" onClick={() => setShowQRProduit(true)}
              style={{ flexShrink: 0 }} title="Scanner un produit">
              📷 Scan
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className={`btn ${curCat === 'all' ? 'btn-primary' : 'btn-outline'} btn-sm`}
              onClick={() => setCurCat('all')}>✨ Tout</button>
            {categories.map(c => (
              <button key={c.slug}
                className={`btn ${curCat === c.slug ? 'btn-primary' : 'btn-outline'} btn-sm`}
                onClick={() => setCurCat(c.slug)}>{c.emoji} {c.nom_fr}</button>
            ))}
          </div>
          <div className="product-grid">
            {filtered.map(p => {
              const jours = p.date_peremption
                ? Math.floor((new Date(p.date_peremption) - new Date()) / 86400000)
                : null
              const expireAlert = jours !== null && jours < 90

              return (
                <div key={p.id} className="product-tile"
                  onClick={() => checkAndAdd(p)}
                  style={{ opacity: p.stock <= 0 ? 0.4 : 1, cursor: p.stock <= 0 ? 'not-allowed' : 'pointer', position: 'relative' }}>
                  {expireAlert && (
                    <div style={{ position: 'absolute', top: 6, right: 6, fontSize: 14 }}
                      title={`Expire dans ${jours} jours`}>
                      {jours < 0 ? '⛔' : jours < 30 ? '🔴' : '🟡'}
                    </div>
                  )}
                  <div className="product-tile-emoji">{p.emoji}</div>
                  <div className="product-tile-name">{p.nom}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>{p.conditionnement}</div>
                  {p.num_id && <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 4, fontFamily: 'monospace' }}>{p.num_id}</div>}
                  <div className="product-tile-price">{p.prix_fcfa?.toLocaleString('fr-FR')} F</div>
                  {p.stock <= 0
                    ? <div style={{ fontSize: 10, color: 'var(--danger2)', marginTop: 4 }}>⛔ Rupture</div>
                    : p.stock < 5
                    ? <div style={{ fontSize: 10, color: 'var(--warn2)', marginTop: 4 }}>⚠️ Stock: {p.stock}</div>
                    : null}
                  {p.date_peremption && (
                    <div style={{ fontSize: 9, color: jours < 30 ? 'var(--danger2)' : jours < 90 ? 'var(--warn2)' : 'var(--t3)', marginTop: 2 }}>
                      Exp: {new Date(p.date_peremption).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Panier */}
        <div className="pos-cart">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--g1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4>🛒 Panier</h4>
              {panier.length > 0 && <button className="btn btn-outline btn-sm" onClick={() => { setPanier([]); retirerAssurance() }}>Vider</button>}
            </div>
          </div>

          {/* Toggle assuré */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: modeAssure ? 'var(--g1)' : '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div onClick={() => { if (!modeAssure) { setModeAssure(true); setShowPopupAssure(true) } else retirerAssurance() }}
                style={{ width: 42, height: 24, borderRadius: 12, cursor: 'pointer', transition: 'all .25s', background: modeAssure ? 'var(--g3)' : 'var(--border)', position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 3, transition: 'all .25s', left: modeAssure ? 21 : 3, boxShadow: '0 1px 4px rgba(0,0,0,.2)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: modeAssure ? 'var(--g4)' : 'var(--t2)' }}>
                  {modeAssure ? '🏥 Client assuré' : 'Client non assuré'}
                </div>
                {assureInfo && <div style={{ fontSize: 11, color: 'var(--t3)' }}>{assureInfo.assurance?.nom} · {assureInfo.service?.taux_couverture}%</div>}
              </div>
              {modeAssure && !assureInfo && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowPopupAssure(true)}>Identifier</button>
              )}
              {assureInfo && (
                <button className="btn btn-outline btn-sm" onClick={() => setShowPopupAssure(true)}>Changer</button>
              )}
            </div>
          </div>

          {/* Infos client */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input className="form-input" placeholder="👤 Nom client" value={clientNom}
              onChange={e => setClientNom(e.target.value)} style={{ flex: 1, fontSize: 13, padding: '8px 10px' }} />
            <input className="form-input" placeholder="📞 Téléphone" value={clientTel}
              onChange={e => setClientTel(e.target.value)} style={{ flex: 1, fontSize: 13, padding: '8px 10px' }} />
          </div>

          {/* Alerte péremption panier */}
          {panierAvecAlerte.length > 0 && (
            <div style={{ margin: '8px 14px', padding: '8px 12px', background: 'var(--warn)', borderRadius: 8, fontSize: 12, color: 'var(--warn2)' }}>
              ⚠️ {panierAvecAlerte.length} produit{panierAvecAlerte.length > 1 ? 's' : ''} avec péremption proche dans le panier
            </div>
          )}

          {/* Articles */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {panier.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🛒</div>
                <div style={{ fontSize: 13 }}>Cliquez sur un produit ou scannez son QR code</div>
              </div>
            ) : (
              panier.map(item => (
                <div key={item.produit_id} className="cart-item-row"
                  style={{ background: item.couvert ? 'var(--g1)' : 'transparent' }}>
                  <span style={{ fontSize: 18 }}>{item.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.nom}
                      {item.couvert && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--g3)', color: '#fff', padding: '1px 6px', borderRadius: 8 }}>✅ {item.remise_pct}%</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'monospace' }}>
                      {item.num_id}
                      {item.date_peremption && (
                        <span style={{ marginLeft: 6, color: (() => {
                          const j = Math.floor((new Date(item.date_peremption) - new Date()) / 86400000)
                          return j < 0 ? 'var(--danger2)' : j < 30 ? 'var(--warn2)' : 'var(--t3)'
                        })() }}>
                          · Exp: {new Date(item.date_peremption).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <button className="qty-btn" onClick={() => changeQty(item.produit_id, -1)}>−</button>
                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{item.quantite}</span>
                    <button className="qty-btn" onClick={() => changeQty(item.produit_id, 1)}>+</button>
                  </div>
                  <div style={{ fontFamily: 'Sora', fontSize: 13, fontWeight: 700, color: 'var(--g4)', minWidth: 65, textAlign: 'right' }}>
                    {item.total_ligne?.toLocaleString('fr-FR')} F
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Total */}
          <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
            {assureInfo && totalAssurance > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t3)', marginBottom: 4 }}>
                  <span>Sous-total</span><span>{totalSansRemise.toLocaleString('fr-FR')} F</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--g4)', fontWeight: 600, marginBottom: 4 }}>
                  <span>🏥 Assurance</span><span>−{Math.round(totalAssurance).toLocaleString('fr-FR')} F</span>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--t2)' }}>{panier.length} article{panier.length > 1 ? 's' : ''}</span>
              <span style={{ fontFamily: 'Sora', fontSize: 22, fontWeight: 700, color: 'var(--g4)' }}>
                {Math.round(total).toLocaleString('fr-FR')} FCFA
              </span>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', fontSize: 14, padding: 12 }}
              onClick={handleEnvoyerCaisse} disabled={!panier.length || loading}>
              {loading ? '⏳ Envoi...' : '📤 Envoyer à la caisse'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal scan QR produit */}
      {showQRProduit && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowQRProduit(false) }}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div className="modal-title">📷 Scanner un produit</div>
              <button className="modal-close" onClick={() => setShowQRProduit(false)}>✕</button>
            </div>
            <QRScanner
              onScan={handleScanProduit}
              onClose={() => setShowQRProduit(false)}
              titre="Scannez le QR Code ou entrez le NumId du produit"
            />
          </div>
        </div>
      )}

      {/* Alerte péremption */}
      {alertePerem && (
        <AlertePeremption
          alertes={alertePerem.alertes}
          onClose={() => setAlertePerem(null)}
          onConfirm={() => { addToCart(alertePerem.produit); setAlertePerem(null) }}
        />
      )}

      {/* Popup assuré */}
      {showPopupAssure && (
        <PopupAssure
          assurances={assurances}
          onIdentified={appliquerAssurance}
          onClose={() => { setShowPopupAssure(false); if (!assureInfo) setModeAssure(false) }}
        />
      )}
    </div>
  )
}
