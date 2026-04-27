import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = 'https://lspfkmqhpjmxngalrhno.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzcGZrbXFocGpteG5nYWxyaG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTgwNDQsImV4cCI6MjA4OTA3NDA0NH0._i8ExSnvOOMSWEioaOyjKXKgNON-MjeRglYC_ovq2vw'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Utilitaires ───────────────────────────────────────────────
export function formatPrix(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('fr-FR') + ' FCFA'
}
export function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR')
}
export function formatDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}
export function getStatutPeremption(date) {
  if (!date) return 'ok'
  const diff = (new Date(date) - new Date()) / 86400000
  if (diff < 0)   return 'expire'
  if (diff < 30)  return 'expire_bientot'
  if (diff < 90)  return 'attention'
  return 'ok'
}

// ── AUTH ──────────────────────────────────────────────────────
export async function signInEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password })
}
export async function signOut() {
  return supabase.auth.signOut()
}
export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}
export async function updatePassword(newPassword) {
  return supabase.auth.updateUser({ password: newPassword })
}
export async function send2FA(telephone) {
  return supabase.auth.signInWithOtp({ phone: telephone })
}
export async function verify2FA(telephone, token) {
  return supabase.auth.verifyOtp({ phone: telephone, token, type: 'sms' })
}

// ── STAFF ─────────────────────────────────────────────────────
export async function getStaffProfile(userId) {
  const { data } = await supabase.from('staff').select('*').eq('id', userId).maybeSingle()
  return data
}
export async function getAllStaff() {
  const { data } = await supabase.from('staff').select('*').eq('actif', true).order('nom')
  return data ?? []
}
export async function updateStaff(id, data) {
  return supabase.from('staff').update(data).eq('id', id)
}
export async function createStaff(staffData) {
  // 1. Créer le compte auth Supabase
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: staffData.email,
    password: staffData.password || 'Epharma2025!',
    email_confirm: true,
  })
  if (authErr) return { error: authErr }
  // 2. Créer le profil staff
  return supabase.from('staff').insert({
    id:        authData.user.id,
    email:     staffData.email,
    nom:       staffData.nom,
    prenom:    staffData.prenom,
    role:      staffData.role,
    telephone: staffData.telephone,
    actif:     true,
  })
}
export async function toggleStaffActif(id, actif) {
  return supabase.from('staff').update({ actif }).eq('id', id)
}

// ── CATÉGORIES ────────────────────────────────────────────────
export async function getCategories() {
  const { data } = await supabase.from('categories').select('*').eq('active', true).order('ordre')
  return data ?? []
}

// ── PRODUITS (catalogue) ──────────────────────────────────────
export async function getProduits(categorieId = null) {
  let q = supabase
    .from('produits')
    .select('*, categories(slug, nom_fr, emoji), fournisseurs(nom)')
    .eq('actif', true)
    .order('nom')
  if (categorieId) q = q.eq('categorie_id', categorieId)
  const { data } = await q
  return data ?? []
}
export async function createProduit(data) {
  // prix_ttc est GENERATED ALWAYS dans Supabase — on l'exclut de l'INSERT
  const { prix_ttc, ...rest } = data
  return supabase.from('produits').insert(rest).select().single()
}
export async function updateProduit(id, data) {
  return supabase.from('produits').update(data).eq('id', id)
}

// ── LOTS (produit_peremption) ─────────────────────────────────
// Enregistrer un nouveau lot à la réserve
export async function createLot(lotData) {
  // Génère un num_id unique si absent
  if (!lotData.num_id) {
    lotData.num_id = 'LOT-' + Date.now() + '-' + Math.floor(Math.random() * 9999)
  }
  return supabase.from('produit_peremption').insert({ ...lotData, statut: 'reserve' }).select().single()
}

// Récupérer tous les lots d'un produit
export async function getLotsProduit(produitId) {
  const { data } = await supabase
    .from('produit_peremption')
    .select('*')
    .eq('produit_id', produitId)
    .not('statut', 'in', '("vendu","expire")')
    .order('date_peremption', { ascending: true })
  return data ?? []
}

// FEFO rayon : meilleurs lots à vendre (stock rayon, les + proches péremption)
export async function getLotsFEFO_Rayon(produitId) {
  const { data } = await supabase
    .from('produit_peremption')
    .select('*')
    .eq('produit_id', produitId)
    .eq('statut', 'rayon')
    .gt('quantite_rayon', 0)
    .order('date_peremption', { ascending: true })
  return data ?? []
}

// FEFO réserve : meilleurs lots à transférer au rayon
export async function getLotsFEFO_Reserve(produitId) {
  const { data } = await supabase
    .from('produit_peremption')
    .select('*')
    .eq('produit_id', produitId)
    .eq('statut', 'reserve')
    .gt('quantite', 0)
    .order('date_peremption', { ascending: true })
  return data ?? []
}

// Scan QR → lot
export async function getLotByNumId(numId) {
  const { data } = await supabase
    .from('produit_peremption')
    .select('*, produits(nom, emoji, prix_ttc, seuil_rayon, code_barre)')
    .eq('num_id', numId.trim())
    .maybeSingle()
  return data
}

// Transfert réserve ↔ rayon via fonction SQL
export async function transfertLot(numId, staffId, codeRayon = null) {
  const { data, error } = await supabase.rpc('transfert_lot', {
    p_num_id: numId,
    p_staff_id: staffId,
    p_coderayon: codeRayon,
  })
  return { data, error }
}

// Produits réserve (pour la page magasinier)
export async function getProduitsReserve() {
  const { data } = await supabase
    .from('v_stock_peremption')
    .select('*')
    .eq('statut', 'reserve')
    .gt('stock_reserve', 0)
    .order('date_peremption', { ascending: true })
  return data ?? []
}

// Produits rayon
export async function getProduitsRayon() {
  const { data } = await supabase
    .from('v_stock_peremption')
    .select('*')
    .eq('statut', 'rayon')
    .order('date_peremption', { ascending: true })
  return data ?? []
}

// Alertes péremption (filtre comptable)
export async function getAlertesPeremption(filtres = {}) {
  let q = supabase
    .from('v_stock_peremption')
    .select('*')
    .order('date_peremption', { ascending: true })
  if (filtres.statut) q = q.in('statut_peremption', [filtres.statut])
  else q = q.in('statut_peremption', ['expire', 'expire_bientot', 'attention'])
  const { data } = await q
  return data ?? []
}

// Stock mouvements
export async function getStockMovements(limit = 100) {
  const { data } = await supabase
    .from('stock_mouvements')
    .select('*, produits(nom, emoji), staff(nom, prenom)')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// Ajustement manuel stock réserve
export async function ajusterStockReserve(lotId, delta, staffId, notes = '') {
  const { data: lot } = await supabase.from('produit_peremption').select('quantite, produit_id').eq('id', lotId).single()
  const avant = lot?.quantite ?? 0
  const apres = Math.max(0, avant + delta)
  await supabase.from('produit_peremption').update({ quantite: apres }).eq('id', lotId)
  return supabase.from('stock_mouvements').insert({
    produit_id: lot.produit_id, lot_id: lotId, staff_id: staffId,
    type_mvt: 'ajustement', quantite: Math.abs(delta),
    stock_avant: avant, stock_apres: apres, notes,
  })
}

// Alias de compatibilité — StockPage utilise encore ajusterStock(produitId, delta, staffId, notes)
// Dans la v2 le stock principal est dans produit_peremption, mais StockPage peut passer
// directement un produit_id : on cherche le premier lot actif en réserve.
export async function ajusterStock(produitId, delta, staffId, notes = '') {
  // Trouver le lot le plus récent en réserve pour ce produit
  const { data: lots } = await supabase
    .from('produit_peremption')
    .select('id, quantite')
    .eq('produit_id', produitId)
    .eq('statut', 'reserve')
    .order('date_peremption', { ascending: true })
    .limit(1)
  if (lots && lots.length > 0) {
    return ajusterStockReserve(lots[0].id, delta, staffId, notes)
  }
  // Fallback : log mouvement sans lot
  return supabase.from('stock_mouvements').insert({
    produit_id: produitId, staff_id: staffId,
    type_mvt: 'ajustement', quantite: Math.abs(delta), notes,
  })
}

export async function getStockAlertes() {
  const { data } = await supabase.from('v_stock_alerte').select('*')
  return data ?? []
}

// ── COMMANDES POS ─────────────────────────────────────────────
export async function creerCommandePOS(vendeuse_id, lignes, client = {}, extraData = {}) {
  const sousTotal    = lignes.reduce((s, l) => s + l.total_ligne, 0)
  const tvaMontant   = lignes.reduce((s, l) => s + (l.total_ligne * (l.tva_pct || 0) / 100), 0)
  const caMontant    = lignes.reduce((s, l) => s + (l.total_ligne * (l.ca_pct  || 0) / 100), 0)
  const total        = client.totalPatient ?? sousTotal

  const { data: cmd, error } = await supabase
    .from('commandes_pos')
    .insert({
      vendeuse_id,
      client_nom:        client.nom  || null,
      client_tel:        client.tel  || null,
      sous_total:        sousTotal,
      remise_montant:    sousTotal - total,
      tva_montant:       tvaMontant,
      ca_montant:        caMontant,
      total,
      statut:            'en_attente',
      assurance_id:      extraData.assurance_id      || null,
      service_id:        extraData.service_id        || null,
      numero_assure:     extraData.numero_assure     || null,
      nom_assure:        extraData.nom_assure        || null,
      taux_couverture:   extraData.taux_couverture   || 0,
      montant_assurance: extraData.montant_assurance || 0,
      montant_patient:   extraData.montant_patient   || total,
    })
    .select().single()

  if (error) return { error }

  const lignesData = lignes.map(l => ({
    commande_id:   cmd.id,
    produit_id:    l.produit_id,
    lot_id:        l.lot_id || null,
    quantite:      l.quantite,
    prix_unitaire: l.prix_unitaire,
    tva_pct:       l.tva_pct || 0,
    ca_pct:        l.ca_pct  || 0,
    total_ligne:   l.total_ligne,
  }))
  const { error: errL } = await supabase.from('commandes_pos_lignes').insert(lignesData)
  if (errL) return { error: errL }
  return { data: cmd }
}

export async function getCommandesPOSEnAttente() {
  const { data } = await supabase
    .from('v_caisse').select('*')
    .in('statut', ['en_attente', 'en_cours'])
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function encaisserCommande(commandeId, caissiere_id, modePaiement, refPaiement = null) {
  // 1. Mettre à jour le statut
  const { data: cmd, error } = await supabase
    .from('commandes_pos')
    .update({ statut: 'payee', caissiere_id, mode_paiement: modePaiement, ref_paiement: refPaiement })
    .eq('id', commandeId)
    .select('id, numero, total, montant_patient, created_at, client_nom')
    .single()

  if (error) return { error }

  // 2. Créer l'écriture comptable recette automatiquement
  const montant = cmd?.montant_patient ?? cmd?.total ?? 0
  if (montant > 0) {
    await supabase.from('ecritures_comptables').insert({
      type_ecriture:  'recette',
      categorie:      'vente_comptoir',
      description:    `Vente ${cmd.numero}${cmd.client_nom ? ' — ' + cmd.client_nom : ''} · ${modePaiement?.replace('_',' ')}`,
      montant,
      date_ecriture:  new Date().toISOString().slice(0, 10),
      staff_id:       caissiere_id,
      commande_id:    commandeId,
    })
  }

  return { data: cmd, error: null }
}

export async function annulerCommande(commandeId) {
  return supabase.from('commandes_pos').update({ statut: 'annulee' }).eq('id', commandeId)
}

export async function getCommandeDetail(commandeId) {
  const { data } = await supabase
    .from('commandes_pos')
    .select(`
      *, staff:vendeuse_id(nom, prenom),
      caissiere:caissiere_id(nom, prenom),
      assurance:assurance_id(nom),
      lignes:commandes_pos_lignes(*, produits(nom, emoji, tva_pct, ca_pct))
    `)
    .eq('id', commandeId)
    .single()
  return data
}

export function ecouterCommandesPOS(onUpdate) {
  return supabase
    .channel('commandes_pos_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes_pos' }, onUpdate)
    .subscribe()
}

// ── AVOIRS ────────────────────────────────────────────────────
export async function getAvoirs() {
  const { data } = await supabase
    .from('avoirs')
    .select('*, commande:commande_id(numero), vendeuse:vendeuse_id(nom, prenom), lignes:avoirs_lignes(*, produits(nom))')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function creerAvoir(commandeId, lignes, motif, vendeuse_id) {
  // Récup infos commande
  const { data: cmd } = await supabase
    .from('commandes_pos')
    .select('client_nom, commandes_pos_lignes(*, produits(nom))')
    .eq('id', commandeId).single()

  const montantTotal = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0)

  const { data: avoir, error } = await supabase
    .from('avoirs')
    .insert({ commande_id: commandeId, vendeuse_id, client_nom: cmd?.client_nom, motif, montant_total: montantTotal })
    .select().single()

  if (error) throw error

  const lignesData = lignes.map(l => ({
    avoir_id: avoir.id,
    produit_id: l.produit_id,
    lot_id: l.lot_id || null,
    quantite: l.quantite,
    prix_unitaire: l.prix_unitaire,
  }))
  await supabase.from('avoirs_lignes').insert(lignesData)
  return avoir
}

export async function traiterAvoir(avoirId, staffId) {
  const { data, error } = await supabase.rpc('traiter_avoir', {
    p_avoir_id: avoirId,
    p_staff_id: staffId,
  })
  return { data, error }
}

// ── BONS DE COMMANDE ──────────────────────────────────────────
export async function getBonsCommande() {
  const { data } = await supabase
    .from('bons_commande')
    .select('*, fournisseurs(nom), staff:gestionnaire_id(nom, prenom), lignes:bons_commande_lignes(*, produits(nom, emoji))')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function creerBonCommande(fournisseur_id, gestionnaire_id, lignes, notes = '') {
  const totalHt = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0)
  const { data: bc, error } = await supabase
    .from('bons_commande')
    .insert({ fournisseur_id, gestionnaire_id, total_ht: totalHt, notes })
    .select().single()
  if (error) throw error

  const lignesData = lignes.map(l => ({
    bon_commande_id: bc.id,
    produit_id:      l.produit_id,
    quantite:        l.quantite,
    prix_unitaire:   l.prix_unitaire,
  }))
  await supabase.from('bons_commande_lignes').insert(lignesData)
  return bc
}

export async function validerBonCommande(id) {
  return supabase.from('bons_commande').update({ statut: 'valide', valide_at: new Date().toISOString() }).eq('id', id)
}
export async function envoyerBonCommande(id) {
  return supabase.from('bons_commande').update({ statut: 'envoye', envoye_at: new Date().toISOString() }).eq('id', id)
}

// Réception BC : crée les lots en réserve
export async function receptionnerCommande(bcId, lots, staffId) {
  // lots = [{ produit_id, quantite, date_peremption, code_lot, coderange, gratuit }]
  const inserts = lots.map(l => ({
    produit_id:      l.produit_id,
    bon_commande_id: bcId,
    quantite:        l.quantite,
    quantite_rayon:  0,
    date_peremption: l.date_peremption,
    code_lot:        l.code_lot || null,
    coderange:       l.coderange || null,
    statut:          'reserve',
    gratuit:         l.gratuit || false,
    created_by:      staffId,
    num_id:          'LOT-' + Date.now() + '-' + Math.floor(Math.random() * 9999),
  }))

  const { error } = await supabase.from('produit_peremption').insert(inserts)
  if (error) throw error

  await supabase.from('bons_commande').update({ statut: 'recu', recu_at: new Date().toISOString() }).eq('id', bcId)

  // Log mouvements
  for (const l of lots) {
    await supabase.from('stock_mouvements').insert({
      produit_id: l.produit_id, staff_id: staffId,
      type_mvt: 'entree_reserve', quantite: l.quantite,
      notes: 'Réception BC',
    })
  }
}

// Vérification seuil avant création BC
export async function verifierSeuilCommande(montant) {
  const { data, error } = await supabase.rpc('verifier_seuil_commandes', { nouveau_montant: montant })
  return { data, error }
}

// ── FACTURES FOURNISSEUR ──────────────────────────────────────
export async function getFacturesFournisseur() {
  const { data } = await supabase
    .from('factures_fournisseur')
    .select('*, fournisseurs(nom), bons_commande(numero), comptable:comptable_id(nom, prenom)')
    .order('date_facture', { ascending: false })
  return data ?? []
}

export async function createFacture(factureData) {
  return supabase.from('factures_fournisseur').insert(factureData).select().single()
}

export async function payerFacture(id, comptableId) {
  return supabase.from('factures_fournisseur').update({ statut: 'payee' }).eq('id', id)
}

// ── VENTES ────────────────────────────────────────────────────
export async function getVentes(limit = 100) {
  const { data } = await supabase
    .from('commandes_pos')
    .select(`
      *, staff:vendeuse_id(nom, prenom),
      caissiere:caissiere_id(nom, prenom),
      lignes:commandes_pos_lignes(quantite, prix_unitaire, total_ligne, produits(nom, emoji))
    `)
    .eq('statut', 'payee')
    .order('paid_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// ── DASHBOARD ─────────────────────────────────────────────────
export async function getDashboard() {
  const { data } = await supabase.from('v_dashboard').select('*').single()
  return data
}

export async function getVentesParJour(jours = 30) {
  const debut = new Date()
  debut.setDate(debut.getDate() - jours)
  const { data } = await supabase
    .from('commandes_pos')
    .select('created_at, total')
    .eq('statut', 'payee')
    .gte('created_at', debut.toISOString())
    .order('created_at')
  return data ?? []
}

// ── COMPTABILITÉ ──────────────────────────────────────────────
export async function getEcritures(mois = null) {
  // Requête de base sans jointures optionnelles qui peuvent échouer
  let q = supabase
    .from('ecritures_comptables')
    .select(`
      id, type_ecriture, categorie, description, montant,
      date_ecriture, created_at, commande_id, facture_id, staff_id
    `)
    .order('date_ecriture', { ascending: false })
  if (mois) q = q.gte('date_ecriture', `${mois}-01`).lte('date_ecriture', `${mois}-31`)
  const { data, error } = await q.limit(500)
  if (error) console.error('getEcritures error:', error)
  return data ?? []
}

// Synchronise les ventes payées qui n'ont pas encore d'écriture comptable
export async function syncVentesVersCompta() {
  // Récupérer les ventes payées du mois
  const debut = new Date(); debut.setDate(1); debut.setHours(0,0,0,0)
  const { data: ventes } = await supabase
    .from('commandes_pos')
    .select('id, numero, total, montant_patient, mode_paiement, client_nom, caissiere_id, created_at')
    .eq('statut', 'payee')
    .gte('created_at', debut.toISOString())

  if (!ventes?.length) return { inserted: 0 }

  // Récupérer les commande_id déjà dans ecritures_comptables
  const { data: existantes } = await supabase
    .from('ecritures_comptables')
    .select('commande_id')
    .not('commande_id', 'is', null)

  const dejaSync = new Set((existantes ?? []).map(e => e.commande_id))

  // Insérer uniquement les ventes manquantes
  const aInserer = ventes
    .filter(v => !dejaSync.has(v.id))
    .map(v => ({
      type_ecriture: 'recette',
      categorie:     'vente_comptoir',
      description:   `Vente ${v.numero}${v.client_nom ? ' — ' + v.client_nom : ''} · ${v.mode_paiement?.replace('_',' ') || ''}`,
      montant:       v.montant_patient ?? v.total ?? 0,
      date_ecriture: new Date(v.created_at).toISOString().slice(0,10),
      staff_id:      v.caissiere_id || null,
      commande_id:   v.id,
    }))

  if (!aInserer.length) return { inserted: 0 }
  const { error } = await supabase.from('ecritures_comptables').insert(aInserer)
  return { inserted: aInserer.length, error }
}

export async function addEcriture(data) {
  return supabase.from('ecritures_comptables').insert(data)
}

// ── FOURNISSEURS ──────────────────────────────────────────────
export async function getFournisseurs() {
  const { data } = await supabase.from('fournisseurs').select('*').eq('actif', true).order('nom')
  return data ?? []
}
export async function createFournisseur(data) {
  return supabase.from('fournisseurs').insert(data)
}
export async function updateFournisseur(id, data) {
  return supabase.from('fournisseurs').update(data).eq('id', id)
}
export async function desactiverFournisseur(id) {
  return supabase.from('fournisseurs').update({ actif: false }).eq('id', id)
}

// ── ASSURANCES ────────────────────────────────────────────────
export async function getAssurancesPartenaires() {
  const { data } = await supabase
    .from('assurances_partenaires')
    .select('*, assurance_services(*)')
    .order('nom')
  return data ?? []
}
export async function createAssurance(data, staffId) {
  return supabase.from('assurances_partenaires').insert({ ...data, created_by: staffId })
}
export async function activerAssurance(id, secretKey, staffId) {
  await new Promise(r => setTimeout(r, 1000))
  if (!secretKey || secretKey.length < 8)
    return { error: { message: 'Clé secrète invalide (min. 8 caractères)' } }
  return supabase.from('assurances_partenaires').update({ active: true, secret_key: secretKey, activated_by: staffId }).eq('id', id)
}

// ── PARAMÈTRES / SEUIL ────────────────────────────────────────
export async function getParametres() {
  const { data } = await supabase.from('parametres_pharmacie').select('*').single()
  return data
}

export async function getSeuilMensuel() {
  const { data } = await supabase.from('parametres_pharmacie').select('seuil_commandes_mois').single()
  return data?.seuil_commandes_mois ?? 0
}

export async function getDemandesSeuil() {
  const { data } = await supabase
    .from('demandes_seuil')
    .select('*, comptable:comptable_id(nom, prenom), valideur:valideur_id(nom, prenom)')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function creerDemandeSeuil(montantDemande, motif, comptableId) {
  const seuil = await getSeuilMensuel()
  return supabase.from('demandes_seuil').insert({
    comptable_id:    comptableId,
    montant_actuel:  seuil,
    montant_demande: montantDemande,
    motif,
  })
}

export async function validerDemandeSeuil(demandeId, approuve, valideurId) {
  if (approuve) {
    // Récupérer le montant demandé
    const { data: demande } = await supabase.from('demandes_seuil').select('montant_demande').eq('id', demandeId).single()
    // Mettre à jour le seuil
    await supabase.from('parametres_pharmacie').update({
      seuil_commandes_mois: demande.montant_demande,
      updated_at: new Date().toISOString(),
      updated_by: valideurId,
    }).eq('id', 1)
  }
  return supabase.from('demandes_seuil').update({
    statut: approuve ? 'approuve' : 'refuse',
    valideur_id: valideurId,
    valide_at: new Date().toISOString(),
  }).eq('id', demandeId)
}

// ── AUDIT ─────────────────────────────────────────────────────
export async function getAuditLogs({ action, statut, staffId, debut, fin, limit = 100 } = {}) {
  let q = supabase
    .from('audit_logs')
    .select('*, staff:staff_id(nom, prenom, role)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (action)  q = q.eq('action', action)
  if (statut)  q = q.eq('statut', statut)
  if (staffId) q = q.eq('staff_id', staffId)
  if (debut)   q = q.gte('created_at', `${debut}T00:00:00`)
  if (fin)     q = q.lte('created_at', `${fin}T23:59:59`)
  const { data } = await q
  return data ?? []
}

export async function getAuditResume() {
  const { data } = await supabase.from('v_audit_resume').select('*').limit(30)
  return data ?? []
}

export async function logAudit({ staffId, action, tableName, recordId, oldData, newData, statut = 'success', details, userAgent }) {
  return supabase.from('audit_logs').insert({
    staff_id:   staffId,
    action,
    table_name: tableName,
    record_id:  recordId,
    old_data:   oldData || null,
    new_data:   newData || null,
    statut,
    details,
    user_agent: userAgent?.slice(0, 200),
  })
}

// Cycle de vente produit (audit superadmin)
export async function getCycleProduits() {
  const { data } = await supabase.from('v_cycle_produit').select('*').order('ca_genere', { ascending: false })
  return data ?? []
}

// ── LIVRAISONS ────────────────────────────────────────────────
export async function getLivraisons() {
  const { data } = await supabase.from('v_livraisons').select('*').order('created_at', { ascending: false })
  return data ?? []
}

export async function creerLivraison(livraisonData) {
  return supabase.from('livraisons').insert(livraisonData).select().single()
}

export async function updateLivraison(id, data) {
  return supabase.from('livraisons').update(data).eq('id', id)
}

