import React, { useEffect, useState, useContext, useRef } from 'react'
import { getProduits, getCategories, creerCommandePOS, supabase } from '../lib/supabase'
import { AuthContext } from '../App'
import QRScanner from '../components/QRScanner'

// ── NOUVELLE VÉRIFICATION PÉREMPTION (LOGIQUE FEFO) ────────────────
async function verifierPrioriteVente(produitId, dateScanne) {
  // On cherche s'il existe une boîte en stock qui périme AVANT celle qu'on a en main
  const { data, error } = await supabase
    .from('produit_peremption')
    .select('*')
    .eq('produit_id', produitId)
    .eq('statut', 'en_stock')
    .lt('date_peremption', dateScanne) // lt = Less Than (plus petit que)
    .order('date_peremption', { ascending: true })
    .limit(5)

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

// ── Composant Alerte péremption ─────────────────────────────────────────
function AlertePeremption({ alertes, produitScan, onClose, onConfirm }) {
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: 'var(--danger2)' }}>⚠️ Priorité de vente (FEFO)</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ background: 'var(--warn)', borderRadius: 10, padding: 16, marginBottom: 15 }}>
          <div style={{ fontWeight: 700, color: 'var(--warn2)', marginBottom: 8, fontSize: 15 }}>
            Attention : Stock plus ancien détecté
          </div>
          <p style={{ fontSize: 13, color: 'var(--warn2)', lineHeight: 1.4 }}>
            Tu as scanné une boîte de <strong>{produitScan.nom}</strong> périmant le {new Date(produitScan.date_peremption).toLocaleDateString('fr-FR')}. 
            Cependant, il reste <strong>{alertes.length}</strong> boîte(s) en rayon qui périment <strong>avant</strong> celle-ci.
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 8, textTransform: 'uppercase' }}>
            Boîtes à vendre en priorité :
          </div>
          {alertes.map(a => (
            <div key={a.id} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '10px', 
              background: 'var(--g1)', 
              borderRadius: 8, 
              marginBottom: 6,
              borderLeft: '4px solid var(--danger2)'
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>📦 Lot: {a.code_lot || 'N/A'}</span>
              <span style={{ fontSize: 13, color: 'var(--danger2)', fontWeight: 700 }}>
                Expire le {new Date(a.date_peremption).toLocaleDateString('fr-FR')}
              </span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', marginBottom: 20, fontStyle: 'italic' }}>
          Vendre les stocks les plus anciens évite les pertes financières à la pharmacie.
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>
            ✕ Chercher la boîte
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onConfirm}>
            Forcer l'ajout
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Popup identification assuré ───────────────────────────────
function PopupAssure({ assurances, onIdentified, onClose }) {
  const [step, setStep] = useState('assurance')
  const [assuranceChoisie, setAssuranceChoisie] = useState(null)
  const [serviceChoisi, setServiceChoisi] = useState(null)
  const [methode, setMethode] = useState(null)
  const [assureData, setAssureData] = useState(null)
  const [loading, setLoading] = useState(false)

  const METHODES = [
    { id: 'qr', label: 'Scanner QR Code', icon: '📷', desc: 'Scanner la carte d\'assuré' },
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
            <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 14 }}>Sélectionnez l'assurance partenaire :</div>
            {assurances.filter(a => a.active).length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--danger2)', background: 'var(--danger)', borderRadius: 10 }}>
                ⚠️ Aucune assurance active.
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
                <div style={{ fontSize: 13, color: 'var(--t3)' }}>Vérification...</div>
              </div>
            ) : methode === 'qr' ? (
              <QRScanner onScan={handleQRScan} onClose={() => setStep('methode')} titre="Scanner la carte d'assuré" />
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--t3)' }}>SMS 2FA — en cours de dev</div>
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
              <div style={{ gridColumn: '1/-1' }}>
                <span style={{ color: 'var(--t3)', fontSize: 12 }}>Service</span>
                <div style={{ fontWeight: 700 }}>{serviceChoisi?.nom_service} · <span style={{ color: 'var(--g4)' }}>{serviceChoisi?.taux_couverture}%</span></div>
              </div>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleConfirm}>Appliquer au panier →</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page POS principale ───────────────────────────────────────
export default function POSPage() {
  const { staff } = useContext(AuthContext)
  const [produits, setProduits] = useState([])
  const [categories, setCategories] = useState([])
  const [assurances, setAssurances] = useState([])
  const [curCat, setCurCat] = useState('all')
  const [search, setSearch] = useState('')
  const [panier, setPanier] = useState([])
  const [modeAssure, setModeAssure] = useState(false)
  const [showPopupAssure, setShowPopupAssure] = useState(false)
  const [assureInfo, setAssureInfo] = useState(null)
  const [clientNom, setClientNom] = useState('')
  const [clientTel, setClientTel] = useState('')
  const [loading, setLoading] = useState(false)
  const [cmdEnvoyee, setCmdEnvoyee] = useState(null)
  const [showQRProduit, setShowQRProduit] = useState(false)
  const [alertePerem, setAlertePerem] = useState(null) 
  const [scanError, setScanError] = useState(null)

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
    const matchCat = curCat === 'all' || p.categories?.slug === curCat
    const matchSearch = !search || p.nom.toLowerCase().includes(search.toLowerCase()) || p.num_id?.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  // ── LOGIQUE DE VÉRIFICATION FEFO AVANT AJOUT ──────────────────
  async function checkAndAdd(produit) {
    if (produit.stock <= 0) return

    // On vérifie si la date de ce produit est optimale par rapport au stock
    if (produit.date_peremption) {
      const boitesPrioritaires = await verifierPrioriteVente(produit.id, produit.date_peremption)
      
      if (boitesPrioritaires.length > 0) {
        setAlertePerem({ alertes: boitesPrioritaires, produit })
        return
      }
    }

    addToCart(produit)
  }

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
    setPanier(prev => {
      const ex = prev.find(i => i.produit_id === produit.id)
      if (ex) {
        if (ex.quantite >= produit.stock) return prev
        return prev.map(i => i.produit_id === produit.id
          ? { ...i, quantite: i.quantite + 1, total_ligne: (i.quantite + 1) * i.prix_unitaire * (1 - i.remise_pct/100) }
          : i)
      }
      return [...prev, {
        produit_id: produit.id,
        nom: produit.nom,
        emoji: produit.emoji,
        prix_unitaire: produit.prix_fcfa,
        categorie_slug: produit.categories?.slug,
        quantite: 1,
        remise_pct: 0,
        total_ligne: produit.prix_fcfa,
        couvert: false,
        date_peremption: produit.date_peremption,
        num_id: produit.num_id,
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

    const service = info.service
    const taux = service?.taux_couverture ?? 0
    const catsCouvertes = service?.tous_produits ? null : service?.categories_couvertes ?? []

    setPanier(prev => prev.map(item => {
      const couvert = service?.tous_produits || catsCouvertes?.includes(item.categorie_slug)
      const remise = couvert ? taux : 0
      return { ...item, couvert, remise_pct: remise, total_ligne: item.quantite * item.prix_unitaire * (1 - remise / 100) }
    }))
  }

  function retirerAssurance() {
    setModeAssure(false); setAssureInfo(null); setClientNom(''); setClientTel('')
    setPanier(prev => prev.map(i => ({ ...i, couvert: false, remise_pct: 0, total_ligne: i.quantite * i.prix_unitaire })))
  }

  const total = panier.reduce((s, i) => s + i.total_ligne, 0)
  const totalSansRemise = panier.reduce((s, i) => s + i.quantite * i.prix_unitaire, 0)
  const totalAssurance = panier.filter(i => i.couvert).reduce((s, i) => s + (i.quantite * i.prix_unitaire * (i.remise_pct / 100)), 0)

  async function handleEnvoyerCaisse() {
    if (!panier.length) return
    setLoading(true)
    const extraData = assureInfo ? {
      assurance_id: assureInfo.assurance?.id,
      service_id: assureInfo.service?.id,
      numero_assure: assureInfo.assure?.numero_assure,
      nom_assure: `${assureInfo.assure?.prenom} ${assureInfo.assure?.nom}`,
      taux_couverture: assureInfo.service?.taux_couverture ?? 0,
      montant_assurance: Math.round(totalAssurance),
      montant_patient: Math.round(total),
    } : {}

    const { data, error } = await creerCommandePOS(
      staff.id,
      panier.map(i => ({
        produit_id: i.produit_id,
        quantite: i.quantite,
        prix_unitaire: i.prix_unitaire,
        remise_pct: i.remise_pct,
        total_ligne: Math.round(i.total_ligne),
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

  return (
    <div>
      {cmdEnvoyee && (
        <div className="alert alert-success" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>✅ Commande <strong>{cmdEnvoyee.numero}</strong> envoyée à la caisse</span>
          <button className="btn btn-outline btn-sm" onClick={() => setCmdEnvoyee(null)}>Nouvelle vente</button>
        </div>
      )}

      {scanError && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>{scanError}</div>
      )}

      <div className="pos-layout">
        {/* Catalogue */}
        <div className="pos-products">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input className="form-input" placeholder="🔍 Rechercher (Nom, NumId)..."
              value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-outline" onClick={() => setShowQRProduit(true)} style={{ flexShrink: 0 }}>
              📷 Scan
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className={`btn ${curCat === 'all' ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setCurCat('all')}>Tout</button>
            {categories.map(c => (
              <button key={c.slug} className={`btn ${curCat === c.slug ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setCurCat(c.slug)}>
                {c.emoji} {c.nom_fr}
              </button>
            ))}
          </div>

          <div className="product-grid">
            {filtered.map(p => (
              <div key={p.id} className="product-tile" onClick={() => checkAndAdd(p)} style={{ opacity: p.stock <= 0 ? 0.4 : 1 }}>
                <div className="product-tile-emoji">{p.emoji}</div>
                <div className="product-tile-name">{p.nom}</div>
                <div className="product-tile-price">{p.prix_fcfa?.toLocaleString('fr-FR')} F</div>
                <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4 }}>
                  Stock: {p.stock} · Exp: {p.date_peremption ? new Date(p.date_peremption).toLocaleDateString('fr-FR') : '-'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Panier latéral */}
        <div className="pos-cart">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--g1)' }}>
            <h4>🛒 Panier</h4>
          </div>

          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div onClick={() => { if (!modeAssure) { setModeAssure(true); setShowPopupAssure(true) } else retirerAssurance() }}
                  style={{ width: 42, height: 24, borderRadius: 12, cursor: 'pointer', background: modeAssure ? 'var(--g3)' : 'var(--border)', position: 'relative' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 3, left: modeAssure ? 21 : 3 }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{modeAssure ? '🏥 Assuré' : 'Non assuré'}</div>
                {modeAssure && !assureInfo && <button className="btn btn-primary btn-sm" onClick={() => setShowPopupAssure(true)}>Identifier</button>}
             </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {panier.map(item => (
              <div key={item.produit_id} className="cart-item-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.nom}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>Exp: {new Date(item.date_peremption).toLocaleDateString('fr-FR')}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <button className="qty-btn" onClick={() => changeQty(item.produit_id, -1)}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{item.quantite}</span>
                  <button className="qty-btn" onClick={() => changeQty(item.produit_id, 1)}>+</button>
                </div>
                <div style={{ width: 70, textAlign: 'right', fontWeight: 700 }}>{item.total_ligne?.toLocaleString('fr-FR')} F</div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 600 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--g4)' }}>{Math.round(total).toLocaleString('fr-FR')} F</span>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleEnvoyerCaisse} disabled={!panier.length || loading}>
              {loading ? 'Envoi...' : '📤 Envoyer à la caisse'}
            </button>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {showQRProduit && (
        <div className="modal-overlay">
          <div className="modal">
            <QRScanner onScan={handleScanProduit} onClose={() => setShowQRProduit(false)} titre="Scan Produit" />
          </div>
        </div>
      )}

      {alertePerem && (
        <AlertePeremption
          alertes={alertePerem.alertes}
          produitScan={alertePerem.produit}
          onClose={() => setAlertePerem(null)}
          onConfirm={() => { addToCart(alertePerem.produit); setAlertePerem(null) }}
        />
      )}

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