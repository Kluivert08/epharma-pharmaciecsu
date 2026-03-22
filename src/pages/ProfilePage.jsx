import React, { useState, useContext } from 'react'
import { AuthContext } from '../App'
import { updatePassword, updateStaff, send2FA, verify2FA } from '../lib/supabase'

const ROLE_LABELS = {
  admin:      'Administrateur',
  stock:      'Gestion Stock',
  vendeuse:   'Vendeuse',
  caissiere:  'Caissière',
  comptable:  'Comptable',
}

export default function ProfilePage() {
  const { staff, handleLogout } = useContext(AuthContext)

  // Mot de passe
  const [pwd,     setPwd]     = useState({ actuel: '', nouveau: '', confirm: '' })
  const [pwdMsg,  setPwdMsg]  = useState(null)
  const [pwdLoad, setPwdLoad] = useState(false)

  // 2FA téléphone
  const [tel,       setTel]       = useState(staff?.telephone || '')
  const [telCode,   setTelCode]   = useState('')
  const [telStep,   setTelStep]   = useState('form')   // form | verify
  const [telMsg,    setTelMsg]    = useState(null)
  const [telLoad,   setTelLoad]   = useState(false)

  // Infos générales
  const [nom,    setNom]    = useState(staff?.nom    || '')
  const [prenom, setPrenom] = useState(staff?.prenom || '')
  const [infoMsg,setInfoMsg]= useState(null)
  const [infoLoad,setInfoLoad]=useState(false)

  async function handleChangePwd(e) {
    e.preventDefault()
    if (pwd.nouveau !== pwd.confirm) { setPwdMsg({ type:'error', text:'Les mots de passe ne correspondent pas.' }); return }
    if (pwd.nouveau.length < 8) { setPwdMsg({ type:'error', text:'Minimum 8 caractères.' }); return }
    setPwdLoad(true)
    const { error } = await updatePassword(pwd.nouveau)
    setPwdLoad(false)
    if (error) { setPwdMsg({ type:'error', text: error.message }); return }
    setPwdMsg({ type:'success', text:'✅ Mot de passe mis à jour avec succès !' })
    setPwd({ actuel: '', nouveau: '', confirm: '' })
  }

  async function handleSendTelCode() {
    if (!tel.trim()) { setTelMsg({ type:'error', text:'Entrez un numéro de téléphone.' }); return }
    setTelLoad(true)
    const { error } = await send2FA(tel)
    setTelLoad(false)
    if (error) { setTelMsg({ type:'error', text: error.message }); return }
    setTelStep('verify')
    setTelMsg({ type:'success', text:`Code envoyé au ${tel}` })
  }

  async function handleVerifyTel() {
    if (!telCode.trim()) return
    setTelLoad(true)
    const { error } = await verify2FA(tel, telCode)
    setTelLoad(false)
    if (error) { setTelMsg({ type:'error', text:'Code invalide ou expiré.' }); return }
    await updateStaff(staff.id, { telephone: tel })
    setTelStep('form')
    setTelCode('')
    setTelMsg({ type:'success', text:'✅ Numéro 2FA mis à jour !' })
  }

  async function handleSaveInfo(e) {
    e.preventDefault()
    setInfoLoad(true)
    await updateStaff(staff.id, { nom, prenom })
    setInfoLoad(false)
    setInfoMsg({ type:'success', text:'✅ Informations mises à jour !' })
  }

  const initiales = `${staff?.prenom?.[0]||''}${staff?.nom?.[0]||''}`.toUpperCase()

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Header profil */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--g4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          {initiales}
        </div>
        <div>
          <h2 style={{ margin: 0 }}>{staff?.prenom} {staff?.nom}</h2>
          <div style={{ color: 'var(--t3)', fontSize: 13, marginTop: 2 }}>{staff?.email}</div>
          <span className={`badge ${staff?.role} mt-1`} style={{ marginTop: 6 }}>{ROLE_LABELS[staff?.role]}</span>
        </div>
      </div>

      {/* Informations générales */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h4 style={{ marginBottom: 16 }}>👤 Informations personnelles</h4>
        {infoMsg && <div className={`alert alert-${infoMsg.type==='success'?'success':'error'}`}>{infoMsg.text}</div>}
        <form onSubmit={handleSaveInfo}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Prénom</label>
              <input className="form-input" value={prenom} onChange={e => setPrenom(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Nom</label>
              <input className="form-input" value={nom} onChange={e => setNom(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Email (non modifiable)</label>
            <input className="form-input" value={staff?.email || ''} disabled style={{ background: 'var(--g1)', color: 'var(--t3)' }} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={infoLoad}>
            {infoLoad ? '⏳ Sauvegarde...' : 'Sauvegarder'}
          </button>
        </form>
      </div>

      {/* Changer mot de passe */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h4 style={{ marginBottom: 16 }}>🔒 Changer le mot de passe</h4>
        {pwdMsg && <div className={`alert alert-${pwdMsg.type==='success'?'success':'error'}`}>{pwdMsg.text}</div>}
        <form onSubmit={handleChangePwd}>
          <div className="form-group">
            <label className="form-label">Nouveau mot de passe</label>
            <input className="form-input" type="password" placeholder="Minimum 8 caractères"
              value={pwd.nouveau} onChange={e => setPwd({...pwd, nouveau: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Confirmer le nouveau mot de passe</label>
            <input className="form-input" type="password" placeholder="Répétez le mot de passe"
              value={pwd.confirm} onChange={e => setPwd({...pwd, confirm: e.target.value})} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={pwdLoad}>
            {pwdLoad ? '⏳ Mise à jour...' : 'Changer le mot de passe'}
          </button>
        </form>
      </div>

      {/* 2FA Téléphone */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h4 style={{ marginBottom: 4 }}>📱 Numéro 2FA</h4>
        <p style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 16 }}>
          Ce numéro reçoit le code de vérification à chaque connexion.
        </p>
        {telMsg && <div className={`alert alert-${telMsg.type==='success'?'success':'error'}`}>{telMsg.text}</div>}

        {telStep === 'form' && (
          <>
            <div className="form-group">
              <label className="form-label">Numéro de téléphone</label>
              <input className="form-input" placeholder="+242 06 XXX XX XX"
                value={tel} onChange={e => setTel(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={handleSendTelCode} disabled={telLoad}>
              {telLoad ? '⏳ Envoi...' : '📲 Envoyer le code de vérification'}
            </button>
          </>
        )}

        {telStep === 'verify' && (
          <>
            <div className="form-group">
              <label className="form-label">Code reçu par SMS</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input className="form-input" placeholder="123456" maxLength={6}
                  value={telCode} onChange={e => setTelCode(e.target.value)} style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={handleVerifyTel} disabled={telLoad}>
                  {telLoad ? '⏳' : '✅ Vérifier'}
                </button>
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => { setTelStep('form'); setTelMsg(null) }}>
              ← Changer le numéro
            </button>
          </>
        )}
      </div>

      {/* Déconnexion */}
      <div className="card">
        <h4 style={{ marginBottom: 10 }}>⏻ Session</h4>
        <p style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 14 }}>
          Connecté en tant que <strong>{staff?.prenom} {staff?.nom}</strong> — {ROLE_LABELS[staff?.role]}
        </p>
        <button className="btn btn-danger" onClick={async () => {
          const { signOut } = await import('../lib/supabase')
          await signOut()
          handleLogout()
        }}>
          🚪 Se déconnecter
        </button>
      </div>
    </div>
  )
}
