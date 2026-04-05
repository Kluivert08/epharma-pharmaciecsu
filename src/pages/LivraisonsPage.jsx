import React, { useEffect, useState, useContext } from 'react'
import { AuthContext } from '../App'
import { supabase } from '../lib/supabase'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet' // Importé pour le marqueur personnalisé
import 'leaflet/dist/leaflet.css'

// ── CONFIGURATION LOCALE AUTONOME ──────────────────────────────────────────
const PHARMACIE_CONFIG = { 
  lat: -4.290397, 
  lng: 15.242837, 
  nom: "Pharmacie CSU",
  zoomInitial: 18 // Réglage du zoom ici (15 = rues visibles)
}

// Création de l'icône verte pour la pharmacie
const greenIcon = new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: var(--g4); width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: var(--shadow);">
           <div style="transform: rotate(45deg); font-size: 15px;">✚</div>
         </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30]
});

// ── API ───────────────────────────────────────────────────────
async function getLivraisons() {
  const { data } = await supabase.from('v_livraisons').select('*').order('created_at', { ascending: false })
  return data ?? []
}

export default function LivraisonsPage() {
  const { staff } = useContext(AuthContext)
  const [livraisons, setLivraisons] = useState([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    client_nom: '', client_tel: '', adresse: '', note: '', 
    lat: PHARMACIE_CONFIG.lat, lng: PHARMACIE_CONFIG.lng
  })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const data = await getLivraisons()
    setLivraisons(data)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('livraisons').insert([{
      ...form,
      vendeuse_id: staff?.id,
      statut: 'en_attente'
    }])
    if (!error) {
      setShowModal(false)
      setForm({ client_nom: '', client_tel: '', adresse: '', note: '', lat: PHARMACIE_CONFIG.lat, lng: PHARMACIE_CONFIG.lng })
      loadData()
    }
    setLoading(false)
  }

  const filtered = livraisons.filter(l => 
    l.client_nom?.toLowerCase().includes(search.toLowerCase()) ||
    l.adresse?.toLowerCase().includes(search.toLowerCase())
  )

  const stats = [
    { label: 'Total', value: livraisons.length, color: 'var(--t1)', icon: '📦' },
    { label: 'En cours', value: livraisons.filter(l => l.statut === 'en_route').length, color: 'var(--blue4)', icon: '🚚' },
    { label: 'Livrées', value: livraisons.filter(l => l.statut === 'livree').length, color: 'var(--g4)', icon: '✅' },
    { label: 'Échecs', value: livraisons.filter(l => l.statut === 'echouee').length, color: 'var(--danger2)', icon: '⚠️' },
  ]

  return (
    <div className="page-container">
      {/* HEADER */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 className="page-title">Livraisons & Logistique</h2>
          <p style={{ color: 'var(--t3)', fontSize: 13 }}>{PHARMACIE_CONFIG.nom}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Nouvelle Livraison
        </button>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {stats.map(s => (
          <div key={s.label} className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 24, background: 'var(--g1)', width: 45, height: 45, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* RECHERCHE */}
      <div className="card" style={{ marginBottom: 20, padding: 10 }}>
        <input 
          className="form-input" 
          placeholder="🔍 Rechercher un nom ou une adresse..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      {/* CARTE ET LISTE */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, height: 'calc(100vh - 350px)', minHeight: 450 }}>
        
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <MapContainer 
            center={[PHARMACIE_CONFIG.lat, PHARMACIE_CONFIG.lng]} 
            zoom={PHARMACIE_CONFIG.zoomInitial} 
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            
            {/* MARQUEUR VERT DE LA PHARMACIE */}
            <Marker position={[PHARMACIE_CONFIG.lat, PHARMACIE_CONFIG.lng]} icon={greenIcon}>
              <Popup><strong>✚ {PHARMACIE_CONFIG.nom}</strong></Popup>
            </Marker>

            {filtered.map(l => (
              <Marker key={l.id} position={[l.lat || PHARMACIE_CONFIG.lat, l.lng || PHARMACIE_CONFIG.lng]}>
                <Popup>
                  <strong>{l.client_nom}</strong><br/>
                  {l.adresse}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* LISTE */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '15px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Files des colis ({filtered.length})</div>
          <div style={{ overflowY: 'auto', flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg)' }}>
            {filtered.map(l => (
              <div key={l.id} className="card" style={{ padding: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, color: 'var(--g4)' }}>{l.client_nom}</span>
                  <span style={{ fontSize: 10, fontWeight: 800 }}>{l.statut?.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 12 }}>📍 {l.adresse}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL AJOUT */}
      {showModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <div className="modal-title">📦 Nouvelle livraison manuelle</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 15, padding: 20 }}>
              <div className="form-group">
                <label className="form-label">Nom du Client</label>
                <input required className="form-input" value={form.client_nom} onChange={e => setForm({...form, client_nom: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone</label>
                <input required className="form-input" value={form.client_tel} onChange={e => setForm({...form, client_tel: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Adresse</label>
                <textarea required className="form-input" value={form.adresse} onChange={e => setForm({...form, adresse: e.target.value})} />
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                {loading ? 'Création...' : 'Enregistrer la livraison'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}