import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = 'https://lspfkmqhpjmxngalrhno.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzcGZrbXFocGpteG5nYWxyaG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0OTgwNDQsImV4cCI6MjA4OTA3NDA0NH0._i8ExSnvOOMSWEioaOyjKXKgNON-MjeRglYC_ovq2vw'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

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
  const { data } = await supabase
    .from('staff')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  return data
}

export async function getAllStaff() {
  const { data } = await supabase.from('staff').select('*').order('nom')
  return data ?? []
}

export async function updateStaff(id, data) {
  return supabase.from('staff').update(data).eq('id', id)
}

export async function createStaff(staffData) {
  return supabase.from('staff').insert({
    id:        staffData.id,
    email:     staffData.email,
    nom:       staffData.nom,
    prenom:    staffData.prenom,
    role:      staffData.role,
    telephone: staffData.telephone,
    actif:     true,
  })
}

// ── PRODUITS ──────────────────────────────────────────────────
export async function getProduits(categorieId = null) {
  let q = supabase
    .from('produits')
    .select('*, categories(slug, nom_fr, emoji)')
    .eq('actif', true)
    .order('nom')
  if (categorieId) q = q.eq('categorie_id', categorieId)
  const { data } = await q
  return data ?? []
}

export async function getCategories() {
  const { data } = await supabase
    .from('categories').select('*').eq('active', true).order('ordre')
  return data ?? []
}

export async function updateProduit(id, data) {
  return supabase.from('produits').update(data).eq('id', id)
}

export async function createProduit(data) {
  return supabase.from('produits').insert(data)
}

// ── COMMANDES POS ─────────────────────────────────────────────
export async function creerCommandePOS(vendeuse_id, lignes, client = {}, extraData = {}) {
  const sousTotal = lignes.reduce((s, l) => s + l.total_ligne, 0)
  const total     = client.totalPatient ?? sousTotal

  const { data: cmd, error } = await supabase
    .from('commandes_pos')
    .insert({
      vendeuse_id,
      client_nom:        client.nom    || null,
      client_tel:        client.tel    || null,
      sous_total:        sousTotal,
      remise_montant:    sousTotal - total,
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
    .select()
    .single()

  if (error) return { error }

  const lignesData = lignes.map(l => ({ ...l, commande_id: cmd.id }))
  const { error: errL } = await supabase.from('commandes_pos_lignes').insert(lignesData)
  if (errL) return { error: errL }

  return { data: cmd }
}

export async function getCommandesPOSEnAttente() {
  const { data } = await supabase
    .from('v_caisse')
    .select('*')
    .in('statut', ['en_attente', 'en_cours'])
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function encaisserCommande(commandeId, caissiere_id, modePaiement, refPaiement = null) {
  return supabase
    .from('commandes_pos')
    .update({
      statut:        'payee',
      caissiere_id,
      mode_paiement:  modePaiement,
      ref_paiement:   refPaiement,
    })
    .eq('id', commandeId)
}

export async function annulerCommande(commandeId) {
  return supabase
    .from('commandes_pos')
    .update({ statut: 'annulee' })
    .eq('id', commandeId)
}

export function ecouterCommandesPOS(onUpdate) {
  return supabase
    .channel('commandes_pos_changes')
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'commandes_pos',
    }, onUpdate)
    .subscribe()
}

// ── VENTES ────────────────────────────────────────────────────
export async function getVentes(limit = 100) {
  const { data } = await supabase
    .from('ventes')
    .select('*, staff:staff_id(nom, prenom), ventes_lignes(quantite, prix_unitaire, total_ligne, produits(nom, emoji))')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// ── STOCK ─────────────────────────────────────────────────────
export async function getStockMovements(limit = 100) {
  const { data } = await supabase
    .from('stock_mouvements')
    .select('*, produits(nom, emoji), staff(nom, prenom)')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function ajusterStock(produitId, quantite, staffId, notes = '') {
  const { data: prod } = await supabase
    .from('produits').select('stock').eq('id', produitId).single()
  const stockAvant = prod?.stock ?? 0
  const stockApres = stockAvant + quantite
  await supabase.from('produits').update({ stock: stockApres }).eq('id', produitId)
  return supabase.from('stock_mouvements').insert({
    produit_id:  produitId,
    staff_id:    staffId,
    type_mvt:    quantite > 0 ? 'entree' : 'ajustement',
    quantite:    Math.abs(quantite),
    stock_avant: stockAvant,
    stock_apres: stockApres,
    notes,
  })
}

export async function getStockAlertes() {
  const { data } = await supabase.from('v_stock_alerte').select('*')
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
    .from('ventes')
    .select('created_at, total')
    .eq('statut', 'payee')
    .gte('created_at', debut.toISOString())
    .order('created_at')
  return data ?? []
}

// ── COMPTABILITÉ ──────────────────────────────────────────────
export async function getEcritures(mois = null) {
  let q = supabase
    .from('ecritures_comptables')
    .select('*')
    .order('date_ecriture', { ascending: false })
  if (mois) {
    q = q.gte('date_ecriture', `${mois}-01`).lte('date_ecriture', `${mois}-31`)
  }
  const { data } = await q.limit(200)
  return data ?? []
}

export async function addEcriture(data) {
  return supabase.from('ecritures_comptables').insert(data)
}

// ── FOURNISSEURS ──────────────────────────────────────────────
export async function getFournisseurs() {
  const { data } = await supabase
    .from('fournisseurs').select('*').eq('actif', true).order('nom')
  return data ?? []
}