import React, { useEffect, useState, useContext, useRef } from 'react'
import { getProduits, getCategories, creerCommandePOS, supabase } from '../lib/supabase'
import { AuthContext } from '../App'
import QRScanner from '../components/QRScanner'

// ── QR Code Scanner simulé (en prod : utiliser expo-barcode-scanner ou jsQR) ─
// function QRScanner({ onScan, onClose }) {
//   const [manual, setManual] = useState('')
//   return (
//     <div style={{ textAlign:'center', padding:20 }}>
//       <div style={{ width:200, height:200, border:'3px dashed var(--g3)', borderRadius:16, margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--g1)', flexDirection:'column', gap:8 }}>
//         <div style={{ fontSize:48 }}>📷</div>
//         <div style={{ fontSize:12, color:'var(--t3)' }}>Caméra QR Code</div>
//         <div style={{ fontSize:11, color:'var(--t3)' }}>(Simulé en mode web)</div>
//       </div>
//       <div style={{ fontSize:13, color:'var(--t2)', marginBottom:12 }}>
//         Ou saisissez manuellement le numéro d'assuré :
//       </div>
//       <div style={{ display:'flex', gap:8 }}>
//         <input className="form-input" placeholder="N° assuré ou QR Code"
//           value={manual} onChange={e => setManual(e.target.value)}
//           onKeyDown={e => e.key==='Enter' && onScan(manual)} />
//         <button className="btn btn-primary" onClick={() => onScan(manual)} disabled={!manual}>
//           →
//         </button>
//       </div>
//       <button className="btn btn-outline btn-sm" style={{ marginTop:12, width:'100%' }} onClick={onClose}>
//         Annuler
//       </button>
//     </div>
//   )
// }

// ── Identification SMS 2FA ────────────────────────────────────────────────────
function SMS2FA({ onVerified, onClose }) {
  const [tel,    setTel]    = useState('')
  const [code,   setCode]   = useState('')
  const [step,   setStep]   = useState('tel')
  const [loading,setLoading]= useState(false)

  async function sendCode() {
    setLoading(true)
    await supabase.auth.signInWithOtp({ phone: tel })
    setLoading(false)
    setStep('code')
  }

  async function verifyCode() {
    // Simulation — en prod vérifier via API assurance
    setLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    setLoading(false)
    if (code === '123456' || code.length === 6) {
      onVerified(tel)
    }
  }

  return (
    <div style={{ padding:20 }}>
      {step === 'tel' ? (
        <>
          <div style={{ fontSize:13, color:'var(--t2)', marginBottom:12 }}>
            Entrez le numéro de téléphone de l'assuré pour envoyer un code de vérification :
          </div>
          <div className="form-group">
            <label className="form-label">Téléphone assuré</label>
            <input className="form-input" placeholder="+242 06 XXX XX XX"
              value={tel} onChange={e => setTel(e.target.value)} keyboardType="phone-pad" />
          </div>
          <button className="btn btn-primary" style={{ width:'100%' }} onClick={sendCode} disabled={loading || !tel}>
            {loading ? '⏳ Envoi...' : '📲 Envoyer le code SMS'}
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize:13, color:'var(--t2)', marginBottom:12 }}>
            Code envoyé au {tel} — Code test : <strong>123456</strong>
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <input className="form-input" placeholder="Code à 6 chiffres" maxLength={6}
              value={code} onChange={e => setCode(e.target.value)} style={{ flex:1 }} />
            <button className="btn btn-primary" onClick={verifyCode} disabled={loading || code.length < 6}>
              {loading ? '⏳' : '✅'}
            </button>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setStep('tel')}>← Changer le numéro</button>
        </>
      )}
      <button className="btn btn-outline btn-sm" style={{ marginTop:8, width:'100%' }} onClick={onClose}>Annuler</button>
    </div>
  )
}

// ── Popup identification assuré ───────────────────────────────────────────────
function PopupAssure({ assurances, onIdentified, onClose }) {
  const [step,          setStep]          = useState('assurance')  // assurance | methode | identification | confirme
  const [assuranceChoisie, setAssuranceChoisie] = useState(null)
  const [serviceChoisi, setServiceChoisi] = useState(null)
  const [methode,       setMethode]       = useState(null)
  const [assureData,    setAssureData]    = useState(null)
  const [loading,       setLoading]       = useState(false)

  const METHODES = [
    { id:'qr',  label:'Scanner QR Code',  icon:'📷', desc:'Scanner la carte d\'assuré' },
    { id:'sms', label:'Vérification SMS',  icon:'📱', desc:'Code par téléphone' },
  ]

  async function handleQRScan(numeroAssure) {
    if (!numeroAssure) return
    setLoading(true)
    // Simulation appel API assureur avec secretKey
    await new Promise(r => setTimeout(r, 1200))
    setLoading(false)
    // Résultat simulé — en prod : appel API vers assureur
    setAssureData({
      numero_assure: numeroAssure,
      nom:           'Jean-Pierre',
      prenom:        'Koubemba',
      telephone:     '+242 06 812 34 56',
    })
    setStep('confirme')
  }

  async function handleSMSVerified(telephone) {
    setLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    setLoading(false)
    setAssureData({
      numero_assure: telephone,
      nom:           'Marie',
      prenom:        'Ossari',
      telephone,
    })
    setStep('confirme')
  }

  function handleConfirm() {
    onIdentified({
      assurance:    assuranceChoisie,
      service:      serviceChoisi,
      assure:       assureData,
    })
  }

  return (
    <div className="modal-overlay" onClick={e => { if(e.target===e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth:460 }}>
        <div className="modal-header">
          <div className="modal-title">Identification assuré</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Étape 1 : Choix assurance */}
        {step === 'assurance' && (
          <div>
            <div style={{ fontSize:13, color:'var(--t2)', marginBottom:14 }}>
              Sélectionnez l'assurance partenaire active :
            </div>
            {assurances.filter(a => a.active).length === 0 ? (
              <div style={{ padding:20, textAlign:'center', color:'var(--danger2)', background:'var(--danger)', borderRadius:10 }}>
                ⚠️ Aucune assurance active. Contactez l'administrateur.
              </div>
            ) : (
              assurances.filter(a => a.active).map(a => (
                <div key={a.id} style={{ marginBottom:10 }}>
                  <button onClick={() => { setAssuranceChoisie(a); setServiceChoisi(a.assurance_services?.[0] || null); setStep('methode') }}
                    style={{
                      width:'100%', padding:14, borderRadius:12, border:'2px solid var(--border)',
                      background:'#fff', cursor:'pointer', textAlign:'left', transition:'all .15s',
                      fontFamily:'Plus Jakarta Sans',
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor='var(--g3)'; e.currentTarget.style.background='var(--g1)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='#fff' }}>
                    <div style={{ fontWeight:700, fontSize:15, color:'var(--t1)' }}>🏥 {a.nom}</div>
                    {a.assurance_services?.map(s => (
                      <div key={s.id} style={{ fontSize:12, color:'var(--t3)', marginTop:4 }}>
                        {s.nom_service} · {s.taux_couverture}% pris en charge
                      </div>
                    ))}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Étape 2 : Choix méthode */}
        {step === 'methode' && (
          <div>
            <div style={{ padding:10, background:'var(--g1)', borderRadius:10, marginBottom:14, fontSize:13, color:'var(--g4)', fontWeight:500 }}>
              🏥 {assuranceChoisie?.nom}
              {serviceChoisi && <span style={{ color:'var(--t3)', fontWeight:400 }}> · {serviceChoisi.nom_service} · {serviceChoisi.taux_couverture}%</span>}
            </div>
            <div style={{ fontSize:13, color:'var(--t2)', marginBottom:14 }}>
              Choisissez la méthode d'identification :
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {METHODES.map(m => (
                <button key={m.id} onClick={() => { setMethode(m.id); setStep('identification') }}
                  style={{
                    padding:16, borderRadius:12, border:'2px solid var(--border)',
                    background:'#fff', cursor:'pointer', display:'flex', alignItems:'center',
                    gap:14, transition:'all .15s', fontFamily:'Plus Jakarta Sans',
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor='var(--g3)'; e.currentTarget.style.background='var(--g1)' }}
                  onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='#fff' }}>
                  <span style={{ fontSize:28 }}>{m.icon}</span>
                  <div style={{ textAlign:'left' }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'var(--t1)' }}>{m.label}</div>
                    <div style={{ fontSize:12, color:'var(--t3)' }}>{m.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <button className="btn btn-outline btn-sm" style={{ marginTop:12, width:'100%' }} onClick={() => setStep('assurance')}>← Retour</button>
          </div>
        )}

        {/* Étape 3 : Identification */}
        {step === 'identification' && (
          <div>
            <div style={{ padding:10, background:'var(--g1)', borderRadius:10, marginBottom:14, fontSize:13, color:'var(--g4)', fontWeight:500 }}>
              🏥 {assuranceChoisie?.nom} · {methode === 'qr' ? '📷 QR Code' : '📱 SMS 2FA'}
            </div>
            {loading && (
              <div style={{ textAlign:'center', padding:30 }}>
                <div className="spinner" style={{ margin:'0 auto 12px' }} />
                <div style={{ fontSize:13, color:'var(--t3)' }}>Vérification en cours...</div>
              </div>
            )}
            {!loading && methode === 'qr' && <QRScanner onScan={handleQRScan} onClose={() => setStep('methode')} />}
            {!loading && methode === 'sms' && <SMS2FA onVerified={handleSMSVerified} onClose={() => setStep('methode')} />}
          </div>
        )}

        {/* Étape 4 : Confirmation */}
        {step === 'confirme' && assureData && (
          <div>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:48, marginBottom:8 }}>✅</div>
              <div style={{ fontSize:16, fontWeight:700, color:'var(--g4)' }}>Assuré identifié</div>
            </div>
            <div style={{ background:'var(--g1)', borderRadius:12, padding:16, marginBottom:16 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 20px', fontSize:14 }}>
                <div><span style={{ color:'var(--t3)', fontSize:12 }}>Nom</span><div style={{ fontWeight:700 }}>{assureData.prenom} {assureData.nom}</div></div>
                <div><span style={{ color:'var(--t3)', fontSize:12 }}>N° assuré</span><div style={{ fontWeight:700 }}>{assureData.numero_assure}</div></div>
                <div><span style={{ color:'var(--t3)', fontSize:12 }}>Téléphone</span><div style={{ fontWeight:700 }}>{assureData.telephone}</div></div>
                <div><span style={{ color:'var(--t3)', fontSize:12 }}>Assurance</span><div style={{ fontWeight:700, color:'var(--g4)' }}>{assuranceChoisie?.nom}</div></div>
                <div style={{ gridColumn:'1/-1' }}>
                  <span style={{ color:'var(--t3)', fontSize:12 }}>Service</span>
                  <div style={{ fontWeight:700 }}>{serviceChoisi?.nom_service} · <span style={{ color:'var(--g4)' }}>{serviceChoisi?.taux_couverture}% pris en charge</span></div>
                </div>
              </div>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width:'100%' }} onClick={handleConfirm}>
              Appliquer au panier →
            </button>
            <button className="btn btn-outline btn-sm" style={{ width:'100%', marginTop:8 }} onClick={() => setStep('assurance')}>
              Recommencer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page POS principale ───────────────────────────────────────────────────────
export default function POSPage() {
  const { staff } = useContext(AuthContext)
  const [produits,      setProduits]      = useState([])
  const [categories,    setCategories]    = useState([])
  const [assurances,    setAssurances]    = useState([])
  const [curCat,        setCurCat]        = useState('all')
  const [search,        setSearch]        = useState('')
  const [panier,        setPanier]        = useState([])
  const [modeAssure,    setModeAssure]    = useState(false)
  const [showPopupAssure, setShowPopupAssure] = useState(false)
  const [assureInfo,    setAssureInfo]    = useState(null)   // { assurance, service, assure }
  const [clientNom,     setClientNom]     = useState('')
  const [clientTel,     setClientTel]     = useState('')
  const [loading,       setLoading]       = useState(false)
  const [cmdEnvoyee,    setCmdEnvoyee]    = useState(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [p, c] = await Promise.all([getProduits(), getCategories()])
    const { data: a } = await supabase.from('assurances_partenaires')
      .select('*, assurance_services(*)').eq('active', true)
    setProduits(p); setCategories(c); setAssurances(a ?? [])
  }

  const filtered = produits.filter(p => {
    const matchCat    = curCat === 'all' || p.categories?.slug === curCat
    const matchSearch = !search || p.nom.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

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
        produit_id:      produit.id,
        nom:             produit.nom,
        emoji:           produit.emoji,
        prix_unitaire:   produit.prix_fcfa,
        categorie_slug:  produit.categories?.slug,
        quantite:        1,
        remise_pct:      0,
        total_ligne:     produit.prix_fcfa,
        couvert:         false,
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

  // Appliquer l'assurance au panier
  function appliquerAssurance(info) {
    setAssureInfo(info)
    setClientNom(`${info.assure.prenom} ${info.assure.nom}`)
    setClientTel(info.assure.telephone)
    setShowPopupAssure(false)

    const service  = info.service
    const taux     = service?.taux_couverture ?? 0
    const catsCouvertes = service?.tous_produits ? null : service?.categories_couvertes ?? []

    setPanier(prev => prev.map(item => {
      const couvert = service?.tous_produits || catsCouvertes?.includes(item.categorie_slug)
      const remise  = couvert ? taux : 0
      return {
        ...item,
        couvert,
        remise_pct:  remise,
        total_ligne: item.quantite * item.prix_unitaire * (1 - remise / 100),
      }
    }))
  }

  function retirerAssurance() {
    setModeAssure(false)
    setAssureInfo(null)
    setClientNom('')
    setClientTel('')
    setPanier(prev => prev.map(i => ({ ...i, couvert:false, remise_pct:0, total_ligne: i.quantite * i.prix_unitaire })))
  }

  const total = panier.reduce((s, i) => s + i.total_ligne, 0)
  const totalSansRemise = panier.reduce((s, i) => s + i.quantite * i.prix_unitaire, 0)
  const totalRemise = totalSansRemise - total
  const totalAssurance = panier.filter(i => i.couvert).reduce((s, i) => s + (i.quantite * i.prix_unitaire * (i.remise_pct/100)), 0)
  const totalPatient   = total

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
      montant_patient:   Math.round(totalPatient),
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

  return (
    <div>
      {cmdEnvoyee && (
        <div className="alert alert-success" style={{ marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span>✅ Commande <strong>{cmdEnvoyee.numero}</strong> envoyée à la caisse — {total.toLocaleString('fr-FR')} FCFA</span>
          <button className="btn btn-outline btn-sm" onClick={() => setCmdEnvoyee(null)}>Nouvelle commande</button>
        </div>
      )}

      <div className="pos-layout">
        {/* Catalogue */}
        <div className="pos-products">
          <div style={{ display:'flex', gap:10, marginBottom:12 }}>
            <input className="form-input" placeholder="🔍 Rechercher un produit..."
              value={search} onChange={e => setSearch(e.target.value)} style={{ flex:1 }} />
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            <button className={`btn ${curCat==='all'?'btn-primary':'btn-outline'} btn-sm`}
              onClick={() => setCurCat('all')}>✨ Tout</button>
            {categories.map(c => (
              <button key={c.slug}
                className={`btn ${curCat===c.slug?'btn-primary':'btn-outline'} btn-sm`}
                onClick={() => setCurCat(c.slug)}>{c.emoji} {c.nom_fr}</button>
            ))}
          </div>
          <div className="product-grid">
            {filtered.map(p => (
              <div key={p.id} className="product-tile"
                onClick={() => addToCart(p)}
                style={{ opacity:p.stock<=0?0.4:1, cursor:p.stock<=0?'not-allowed':'pointer' }}>
                <div className="product-tile-emoji">{p.emoji}</div>
                <div className="product-tile-name">{p.nom}</div>
                <div style={{ fontSize:11, color:'var(--t3)', marginBottom:4 }}>{p.conditionnement}</div>
                <div className="product-tile-price">{p.prix_fcfa?.toLocaleString('fr-FR')} F</div>
                {p.stock<=0 ? <div style={{ fontSize:10, color:'var(--danger2)', marginTop:4 }}>⛔ Rupture</div>
                  : p.stock<5 ? <div style={{ fontSize:10, color:'var(--warn2)', marginTop:4 }}>⚠️ Stock: {p.stock}</div> : null}
              </div>
            ))}
          </div>
        </div>

        {/* Panier */}
        <div className="pos-cart">
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', background:'var(--g1)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <h4>🛒 Panier</h4>
              {panier.length > 0 && <button className="btn btn-outline btn-sm" onClick={() => { setPanier([]); retirerAssurance() }}>Vider</button>}
            </div>
          </div>

          {/* Toggle assuré / non assuré */}
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', background: modeAssure ? 'var(--g1)' : '#fff' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {/* Toggle switch */}
              <div onClick={() => {
                  if (!modeAssure) { setModeAssure(true); setShowPopupAssure(true) }
                  else retirerAssurance()
                }}
                style={{
                  width:42, height:24, borderRadius:12, cursor:'pointer', transition:'all .25s',
                  background: modeAssure ? 'var(--g3)' : 'var(--border)',
                  position:'relative', flexShrink:0,
                }}>
                <div style={{
                  width:18, height:18, borderRadius:9, background:'#fff',
                  position:'absolute', top:3, transition:'all .25s',
                  left: modeAssure ? 21 : 3,
                  boxShadow:'0 1px 4px rgba(0,0,0,.2)',
                }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color: modeAssure ? 'var(--g4)' : 'var(--t2)' }}>
                  {modeAssure ? '🏥 Client assuré' : 'Client non assuré'}
                </div>
                {assureInfo && (
                  <div style={{ fontSize:11, color:'var(--t3)' }}>
                    {assureInfo.assurance?.nom} · {assureInfo.service?.taux_couverture}% · {assureInfo.service?.nom_service}
                  </div>
                )}
              </div>
              {modeAssure && !assureInfo && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowPopupAssure(true)}>
                  Identifier
                </button>
              )}
              {assureInfo && (
                <button className="btn btn-outline btn-sm" onClick={() => setShowPopupAssure(true)}>
                  Changer
                </button>
              )}
            </div>
          </div>

          {/* Infos client */}
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:8 }}>
            <input className="form-input" placeholder="👤 Nom client"
              value={clientNom} onChange={e => setClientNom(e.target.value)}
              style={{ flex:1, fontSize:13, padding:'8px 10px' }} />
            <input className="form-input" placeholder="📞 Téléphone"
              value={clientTel} onChange={e => setClientTel(e.target.value)}
              style={{ flex:1, fontSize:13, padding:'8px 10px' }} />
          </div>

          {/* Articles */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {panier.length === 0 ? (
              <div style={{ padding:32, textAlign:'center', color:'var(--t3)' }}>
                <div style={{ fontSize:36, marginBottom:8 }}>🛒</div>
                <div style={{ fontSize:13 }}>Cliquez sur un produit pour l'ajouter</div>
              </div>
            ) : (
              panier.map(item => (
                <div key={item.produit_id} className="cart-item-row"
                  style={{ background: item.couvert ? 'var(--g1)' : 'transparent' }}>
                  <span style={{ fontSize:18 }}>{item.emoji}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {item.nom}
                      {item.couvert && <span style={{ marginLeft:6, fontSize:10, background:'var(--g3)', color:'#fff', padding:'1px 6px', borderRadius:8 }}>✅ {item.remise_pct}%</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)' }}>{item.prix_unitaire?.toLocaleString('fr-FR')} F/u</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <button className="qty-btn" onClick={() => changeQty(item.produit_id, -1)}>−</button>
                    <span style={{ fontSize:13, fontWeight:700, minWidth:18, textAlign:'center' }}>{item.quantite}</span>
                    <button className="qty-btn" onClick={() => changeQty(item.produit_id, 1)}>+</button>
                  </div>
                  <div style={{ fontFamily:'Sora', fontSize:13, fontWeight:700, color:'var(--g4)', minWidth:65, textAlign:'right' }}>
                    {item.total_ligne?.toLocaleString('fr-FR')} F
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Total */}
          <div style={{ borderTop:'1px solid var(--border)', padding:14 }}>
            {assureInfo && totalRemise > 0 && (
              <div style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--t3)', marginBottom:4 }}>
                  <span>Sous-total</span><span>{totalSansRemise.toLocaleString('fr-FR')} F</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--g4)', fontWeight:600, marginBottom:4 }}>
                  <span>🏥 Prise en charge assurance</span><span>−{Math.round(totalAssurance).toLocaleString('fr-FR')} F</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--t2)', marginBottom:4 }}>
                  <span>À payer par le patient</span><span style={{ fontWeight:600 }}>{Math.round(totalPatient).toLocaleString('fr-FR')} F</span>
                </div>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <span style={{ fontSize:15, fontWeight:600, color:'var(--t2)' }}>{panier.length} article{panier.length>1?'s':''}</span>
              <span style={{ fontFamily:'Sora', fontSize:22, fontWeight:700, color:'var(--g4)' }}>
                {Math.round(totalPatient).toLocaleString('fr-FR')} FCFA
              </span>
            </div>
            <button className="btn btn-primary"
              style={{ width:'100%', fontSize:14, padding:12, background:'var(--g4)' }}
              onClick={handleEnvoyerCaisse}
              disabled={!panier.length || loading}>
              {loading ? '⏳ Envoi...' : '📤 Envoyer à la caisse'}
            </button>
            <div style={{ fontSize:11, color:'var(--t3)', textAlign:'center', marginTop:6 }}>
              La caissière encaissera le client
            </div>
          </div>
        </div>
      </div>

      {/* Popup identification assuré */}
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
