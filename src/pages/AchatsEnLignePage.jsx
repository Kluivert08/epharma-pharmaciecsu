import React, { useEffect, useState, useContext, useRef } from 'react'
import { AuthContext } from '../App'
import { supabase } from '../lib/supabase'
import { getStreamClient, initStreamClient } from '../lib/getstream'

// ── API ───────────────────────────────────────────────────────
async function getCommandesEnLigne() {
  const { data } = await supabase
    .from('commandes')
    .select(`
      id, statut, total, created_at,
      adresse_livraison_texte,
      adresse_gps_lat, adresse_gps_lng,
      besoin_prescription, prescription_url,
      is_online,
      profiles!inner(
        id, username, nom_complet, telephone, email,
        assurance_active, numero_assure
      ),
      commandes_lignes(
        quantite, prix_unitaire,
        produits(nom, emoji, num_id, date_peremption)
      )
    `)
    .eq('is_online', true)
    .order('created_at', { ascending: false })
    .limit(100)
  return data ?? []
}

async function updateStatutCommande(id, statut, notes = '') {
  return supabase.from('commandes').update({ statut, notes }).eq('id', id)
}

async function creerLivraisonDepuisCommande(commande, staffId) {
  const code = Math.floor(1000 + Math.random() * 9000).toString()
  return supabase.from('livraisons').insert({
    vendeuse_id:         staffId,
    commande_app_id:     commande.id,
    client_nom:          `${commande.profiles?.prenom} ${commande.profiles?.nom}`,
    client_tel:          commande.profiles?.telephone,
    adresse:             commande.adresse_livraison_texte || 'Adresse non précisée',
    ville:               'Brazzaville',
    statut:              'preparee',
    code_retrait_client: code,
    frais_livraison:     0,
  }).select().single()
}

// ── Statuts ───────────────────────────────────────────────────
const STATUTS = {
  en_attente:          { label:'En attente',         icon:'⏳', bg:'#FFF8E1', color:'#F9A825' },
  attente_prescription:{ label:'Ordonnance requise', icon:'📋', bg:'#FFF3E0', color:'#E65100' },
  validee:             { label:'Validée',            icon:'✅', bg:'#E8F5E9', color:'#2E7D32' },
  en_livraison:        { label:'En livraison',       icon:'🚚', bg:'#E3F2FD', color:'#1565C0' },
  livree:              { label:'Livrée',             icon:'🎉', bg:'#E8F5E9', color:'#2E7D32' },
  refusee:             { label:'Refusée',            icon:'❌', bg:'#FFEBEE', color:'#C62828' },
}

// ── Panel chat GetStream ──────────────────────────────────────
function ChatPanel({ clientId, clientNom, streamClient }) {
  const [channel,  setChannel]  = useState(null)
  const [messages, setMessages] = useState([])
  const [draft,    setDraft]    = useState('')
  const [loading,  setLoading]  = useState(true)
  const endRef                   = useRef(null)

  useEffect(() => {
    if (streamClient && clientId) openChannel()
    return () => { channel?.stopWatching() }
  }, [streamClient, clientId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function openChannel() {
    try {
      setLoading(true)
      const ch = streamClient.channel('messaging', {
        members: [streamClient.userID, clientId],
      })
      await ch.watch()
      await ch.markRead()
      setMessages(ch.state.messages || [])
      setChannel(ch)
      ch.on('message.new', e => setMessages(prev => [...prev, e.message]))
      setLoading(false)
    } catch (e) {
      console.log('Chat error:', e)
      setLoading(false)
    }
  }

  async function sendMessage() {
    if (!draft.trim() || !channel) return
    try {
      await channel.sendMessage({ text: draft })
      setDraft('')
    } catch (e) { console.log('Send error:', e) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--g1)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--g3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>
          {clientNom?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{clientNom}</div>
          <div style={{ fontSize: 11, color: 'var(--g4)' }}>● App PharmacieCSU</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30 }}>
            <div className="spinner" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>Connexion au chat...</div>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--t3)', fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            Démarrez la conversation avec {clientNom}
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMine = msg.user?.id === streamClient?.userID
            return (
              <div key={msg.id || i} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  padding: '8px 12px', borderRadius: 12, maxWidth: '80%',
                  borderBottomRightRadius: isMine ? 4 : 12,
                  borderBottomLeftRadius:  isMine ? 12 : 4,
                  background: isMine ? 'var(--g4)' : 'var(--g1)',
                  color:      isMine ? '#fff' : 'var(--t1)',
                  fontSize: 13, lineHeight: 1.5,
                }}>
                  {msg.text}
                  {msg.attachments?.map((a, j) => a.type === 'image' && (
                    <img key={j} src={a.image_url} alt="ordonnance"
                      style={{ width: '100%', borderRadius: 8, marginTop: 6 }} />
                  ))}
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Messages rapides */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          'Bonjour, votre commande est en cours de traitement.',
          'Merci d\'envoyer une photo de votre ordonnance.',
          'Votre commande est prête pour la livraison !',
        ].map(msg => (
          <button key={msg} onClick={() => setDraft(msg)}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 12, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--t2)', whiteSpace: 'nowrap' }}>
            {msg.slice(0, 30)}...
          </button>
        ))}
      </div>

      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 20, padding: '9px 14px', fontSize: 13, outline: 'none', fontFamily: 'Plus Jakarta Sans' }}
          placeholder="Écrire au client..."
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          onFocus={e => e.target.style.borderColor = 'var(--g3)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <button onClick={sendMessage} disabled={!draft.trim()}
          style={{ width: 40, height: 40, borderRadius: 12, background: draft.trim() ? 'var(--g4)' : 'var(--g2)', border: 'none', color: '#fff', cursor: draft.trim() ? 'pointer' : 'default', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ↑
        </button>
      </div>
    </div>
  )
}

// ── Détail commande ───────────────────────────────────────────
function DetailCommande({ commande, onClose, onAction, streamClient }) {
  const { staff } = useContext(AuthContext)
  const [actioning, setActioning] = useState(false)
  const [tab, setTab] = useState('detail')

  const clientId  = commande.profiles?.id
  const clientNom = `${commande.profiles?.prenom} ${commande.profiles?.nom}`

  async function handleAction(statut) {
    setActioning(true)
    if (statut === 'en_livraison') {
      await creerLivraisonDepuisCommande(commande, staff.id)
    }
    await updateStatutCommande(commande.id, statut)
    onAction()
    setActioning(false)
  }

  const totalArticles = commande.commandes_lignes?.reduce((s, l) => s + l.quantite, 0) || 0

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 880, width: '95vw', height: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'Sora', fontSize: 18, fontWeight: 700 }}>Commande en ligne</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>{new Date(commande.created_at).toLocaleString('fr-FR')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: STATUTS[commande.statut]?.bg, color: STATUTS[commande.statut]?.color }}>
              {STATUTS[commande.statut]?.icon} {STATUTS[commande.statut]?.label}
            </span>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {['detail', 'chat'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '12px 0', border: 'none', background: tab === t ? 'var(--g1)' : '#fff', fontWeight: tab === t ? 700 : 400, color: tab === t ? 'var(--g4)' : 'var(--t3)', fontSize: 14, cursor: 'pointer', borderBottom: tab === t ? '2px solid var(--g4)' : 'none' }}>
              {t === 'detail' ? '📋 Détail commande' : '💬 Chat client'}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {tab === 'detail' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {/* Infos client */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', fontSize: 13, marginBottom: 16, padding: 14, background: 'var(--g1)', borderRadius: 10 }}>
                <div>
                  <div style={{ color: 'var(--t3)', fontSize: 11, marginBottom: 2 }}>Client</div>
                  <div style={{ fontWeight: 700 }}>{clientNom}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--t3)', fontSize: 11, marginBottom: 2 }}>Téléphone</div>
                  <div style={{ fontWeight: 700 }}>{commande.profiles?.telephone || '—'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--t3)', fontSize: 11, marginBottom: 2 }}>Total payé</div>
                  <div style={{ fontWeight: 700, color: 'var(--g4)', fontFamily: 'Sora', fontSize: 16 }}>{commande.total?.toLocaleString('fr-FR')} FCFA</div>
                </div>
                <div>
                  <div style={{ color: 'var(--t3)', fontSize: 11, marginBottom: 2 }}>Paiement</div>
                  <div style={{ fontWeight: 700 }}>✅ Mobile Money (Payé)</div>
                </div>
                {commande.profiles?.assurance_active && (
                  <div style={{ gridColumn: '1/-1' }}>
                    <div style={{ color: 'var(--t3)', fontSize: 11, marginBottom: 2 }}>Assurance</div>
                    <div style={{ fontWeight: 700, color: 'var(--g4)' }}>🏥 Assuré · N° {commande.profiles?.numero_assure}</div>
                  </div>
                )}
                <div style={{ gridColumn: '1/-1' }}>
                  <div style={{ color: 'var(--t3)', fontSize: 11, marginBottom: 2 }}>Adresse de livraison</div>
                  <div style={{ fontWeight: 700 }}>📍 {commande.adresse_livraison_texte || '—'}</div>
                  {commande.adresse_gps_lat && (
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                      GPS : {commande.adresse_gps_lat?.toFixed(6)}, {commande.adresse_gps_lng?.toFixed(6)}
                    </div>
                  )}
                </div>
              </div>

              {/* Produits */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                  Articles ({totalArticles} unité{totalArticles > 1 ? 's' : ''})
                </div>
                {commande.commandes_lignes?.map((l, i) => {
                  const needsPrescription = false // À implémenter selon liste produits
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 22 }}>{l.produits?.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{l.produits?.nom}</div>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                          {l.prix_unitaire?.toLocaleString('fr-FR')} F × {l.quantite}
                          {l.produits?.num_id && <span style={{ marginLeft: 8, fontFamily: 'monospace' }}>{l.produits.num_id}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: 'var(--g4)' }}>{(l.prix_unitaire * l.quantite)?.toLocaleString('fr-FR')} F</div>
                        {needsPrescription && <span style={{ fontSize: 10, background: '#FFF3E0', color: '#E65100', padding: '1px 6px', borderRadius: 8 }}>📋 Ordonnance</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Ordonnance si présente */}
              {commande.prescription_url && (
                <div style={{ marginBottom: 16, padding: 14, background: 'var(--g1)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', marginBottom: 8 }}>📋 Ordonnance reçue</div>
                  <img src={commande.prescription_url} alt="Ordonnance"
                    style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
                </div>
              )}

              {/* Actions */}
              {(commande.statut === 'en_attente' || commande.statut === 'attente_prescription') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Actions</div>

                  {commande.statut === 'en_attente' && (
                    <button className="btn btn-primary btn-lg" onClick={() => handleAction('en_livraison')} disabled={actioning}>
                      {actioning ? '⏳...' : '🚚 Valider et créer la livraison'}
                    </button>
                  )}

                  <button className="btn btn-outline btn-lg"
                    style={{ color: '#E65100', borderColor: '#E65100' }}
                    onClick={() => { handleAction('attente_prescription'); setTab('chat') }}
                    disabled={actioning}>
                    📋 Demander une ordonnance (→ Chat)
                  </button>

                  <button className="btn btn-outline btn-lg"
                    style={{ color: 'var(--danger2)', borderColor: 'var(--danger2)' }}
                    onClick={() => handleAction('refusee')}
                    disabled={actioning}>
                    ❌ Refuser la commande
                  </button>
                </div>
              )}

              {commande.statut === 'en_livraison' && (
                <div style={{ padding: 16, background: 'var(--g1)', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🚚</div>
                  <div style={{ fontWeight: 700, color: 'var(--g4)' }}>Livraison en cours</div>
                  <div style={{ fontSize: 13, color: 'var(--t3)' }}>Suivez la livraison dans le module Livraisons</div>
                </div>
              )}
            </div>
          )}

          {tab === 'chat' && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {streamClient ? (
                <ChatPanel clientId={clientId} clientNom={clientNom} streamClient={streamClient} />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  Connexion au chat GetStream...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────
export default function AchatsEnLignePage() {
  const { staff }                         = useContext(AuthContext)
  const [commandes,    setCommandes]       = useState([])
  const [loading,      setLoading]         = useState(true)
  const [selected,     setSelected]        = useState(null)
  const [filtreStatut, setFiltreStatut]    = useState('all')
  const [streamClient, setStreamClient]    = useState(null)
  const [nouvelleCmd,  setNouvelleCmd]     = useState(false)
  const channelRef                          = useRef(null)

  useEffect(() => {
    loadCommandes()

    // Init GetStream si vendeuse/admin
    if (staff?.role === 'vendeuse' || staff?.role === 'admin') {
      initStreamClient(staff).then(setStreamClient).catch(console.log)
    }

    // Realtime nouvelles commandes
    channelRef.current = supabase
      .channel('achats_en_ligne_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'commandes' }, payload => {
        if (payload.new.is_online) {
          loadCommandes()
          setNouvelleCmd(true)
          setTimeout(() => setNouvelleCmd(false), 5000)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commandes' }, () => {
        loadCommandes()
      })
      .subscribe()

    return () => { channelRef.current?.unsubscribe() }
  }, [])

  async function loadCommandes() {
    const data = await getCommandesEnLigne()
    setCommandes(data)
    setLoading(false)
  }

  const filtered = commandes.filter(c =>
    filtreStatut === 'all' || c.statut === filtreStatut
  )

  // Stats
  const stats = {
    total:               commandes.length,
    en_attente:          commandes.filter(c => c.statut === 'en_attente').length,
    attente_prescription:commandes.filter(c => c.statut === 'attente_prescription').length,
    en_livraison:        commandes.filter(c => c.statut === 'en_livraison').length,
    livrees:             commandes.filter(c => c.statut === 'livree').length,
  }

  if (loading) return <div className="loader"><div className="spinner" /></div>

  return (
    <div>
      {nouvelleCmd && (
        <div className="alert alert-warn" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>🔔</span>
          <strong>Nouvelle commande en ligne reçue !</strong>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label:'Total',          value:stats.total,               color:'var(--t1)',      icon:'🛍️' },
          { label:'En attente',     value:stats.en_attente,          color:'#F9A825',        icon:'⏳' },
          { label:'Ordonnance',     value:stats.attente_prescription, color:'#E65100',       icon:'📋' },
          { label:'En livraison',   value:stats.en_livraison,        color:'#1565C0',        icon:'🚚' },
          { label:'Livrées',        value:stats.livrees,             color:'var(--g4)',      icon:'✅' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor:'pointer' }}
            onClick={() => setFiltreStatut(i===0?'all':Object.keys(STATUTS)[i-1])}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <div className="stat-label" style={{ fontSize:10 }}>{s.label}</div>
              <span style={{ fontSize:18 }}>{s.icon}</span>
            </div>
            <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <button className={`btn btn-sm ${filtreStatut==='all'?'btn-primary':'btn-outline'}`}
          onClick={() => setFiltreStatut('all')}>Toutes</button>
        {Object.entries(STATUTS).map(([key, s]) => (
          <button key={key}
            className={`btn btn-sm ${filtreStatut===key?'btn-primary':'btn-outline'}`}
            onClick={() => setFiltreStatut(key)}
            style={{ color:filtreStatut!==key?s.color:'', borderColor:filtreStatut!==key?s.color:'' }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Liste commandes */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:60, color:'var(--t3)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🛍️</div>
          <div style={{ fontSize:16, fontWeight:600, color:'var(--t1)', marginBottom:4 }}>Aucune commande en ligne</div>
          <div style={{ fontSize:13 }}>Les commandes de l'app PharmacieCSU apparaissent ici en temps réel</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {filtered.map(cmd => {
            const s = STATUTS[cmd.statut] || STATUTS.en_attente
            const clientNom = `${cmd.profiles?.prenom} ${cmd.profiles?.nom}`
            const totalArticles = cmd.commandes_lignes?.reduce((sum, l) => sum + l.quantite, 0) || 0

            return (
              <div key={cmd.id} className="card"
                style={{ cursor:'pointer', borderLeft:`4px solid ${s.color}`, transition:'all .15s' }}
                onClick={() => setSelected(cmd)}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                  <div style={{ fontSize:28, flexShrink:0 }}>{s.icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <span style={{ fontWeight:700, fontSize:15 }}>{clientNom}</span>
                      <span style={{ padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600, background:s.bg, color:s.color }}>
                        {s.label}
                      </span>
                      {cmd.profiles?.assurance_active && (
                        <span className="badge badge-green" style={{ fontSize:10 }}>🏥 Assuré</span>
                      )}
                      {cmd.besoin_prescription && (
                        <span style={{ fontSize:10, background:'#FFF3E0', color:'#E65100', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>
                          📋 Ordonnance requise
                        </span>
                      )}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px 20px', fontSize:13, color:'var(--t2)', marginBottom:8 }}>
                      <span>📞 {cmd.profiles?.telephone || '—'}</span>
                      <span>📍 {cmd.adresse_livraison_texte?.slice(0,30) || '—'}</span>
                      <span>🕐 {new Date(cmd.created_at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                    {/* Aperçu produits */}
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                      {cmd.commandes_lignes?.slice(0,4).map((l, i) => (
                        <span key={i} style={{ background:'var(--g1)', borderRadius:6, padding:'3px 8px', fontSize:12 }}>
                          {l.produits?.emoji} {l.produits?.nom} × {l.quantite}
                        </span>
                      ))}
                      {cmd.commandes_lignes?.length > 4 && (
                        <span style={{ fontSize:12, color:'var(--t3)' }}>+{cmd.commandes_lignes.length-4} autres</span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontFamily:'Sora', fontSize:20, fontWeight:700, color:'var(--g4)' }}>
                      {cmd.total?.toLocaleString('fr-FR')} F
                    </div>
                    <div style={{ fontSize:12, color:'var(--t3)' }}>{totalArticles} article{totalArticles>1?'s':''}</div>
                    <div style={{ fontSize:11, color:'var(--g3)', marginTop:4 }}>✅ Mobile Money</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal détail */}
      {selected && (
        <DetailCommande
          commande={selected}
          onClose={() => setSelected(null)}
          onAction={() => { loadCommandes(); setSelected(null) }}
          streamClient={streamClient}
        />
      )}
    </div>
  )
}
