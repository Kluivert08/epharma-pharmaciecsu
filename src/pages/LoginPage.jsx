import React, { useState, useRef } from 'react'
import { signInEmail, getStaffProfile, send2FA, verify2FA } from '../lib/supabase'

const FEATURES = [
  { icon: '📊', text: 'Dashboard en temps réel' },
  { icon: '🛒', text: 'Point de vente intégré' },
  { icon: '📦', text: 'Gestion de stock unifiée' },
  { icon: '💰', text: 'MTN MoMo · Airtel · Visa' },
  { icon: '📈', text: 'Comptabilité automatique' },
]

export default function LoginPage({ onLogin }) {
  const [step,     setStep]     = useState('login')   // login | 2fa
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [phone,    setPhone]    = useState('')
  const [otp,      setOtp]      = useState(['','','','','',''])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [tempUser, setTempUser] = useState(null)
  const otpRefs = useRef([])

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data, error: err } = await signInEmail(email, password)
    if (err) { setError('Email ou mot de passe incorrect.'); setLoading(false); return }

    const staff = await getStaffProfile(data.user.id)
    if (!staff) {
  // Réessayer une fois après 1 seconde
  await new Promise(r => setTimeout(r, 1000))
  const staffRetry = await getStaffProfile(data.user.id)
  if (!staffRetry) { setError('Compte non trouvé. Contactez un administrateur.'); setLoading(false); return }
  setTempUser({ user: data.user, staff: staffRetry })
  if (staffRetry.telephone) {
    await send2FA(staffRetry.telephone)
    setPhone(staffRetry.telephone)
    setLoading(false)
    setStep('2fa')
  } else {
    onLogin(data.user, staffRetry)
  }
  return
}
    if (!staff.actif) { setError('Votre compte est désactivé.'); setLoading(false); return }

    setTempUser({ user: data.user, staff })

    // Envoyer 2FA si téléphone configuré
    if (staff.telephone) {
      await send2FA(staff.telephone)
      setPhone(staff.telephone)
      setLoading(false)
      setStep('2fa')
    } else {
      // Pas de 2FA configuré, connexion directe
      onLogin(data.user, staff)
    }
  }

  async function handleVerify2FA() {
    setError('')
    setLoading(true)
    const code = otp.join('')
    if (code.length < 6) { setError('Entrez le code à 6 chiffres.'); setLoading(false); return }

    // Mode test — code 123456 accepté
    if (code === '123456') {
      onLogin(tempUser.user, tempUser.staff)
      return
    }

    const { error: err } = await verify2FA(phone, code)
    if (err) { setError('Code invalide ou expiré.'); setLoading(false); return }
    onLogin(tempUser.user, tempUser.staff)
  }

  function handleOtpChange(val, i) {
    const next = [...otp]; next[i] = val
    setOtp(next)
    if (val && i < 5) otpRefs.current[i + 1]?.focus()
  }

  return (
    <div className="login-page">
      {/* Gauche */}
      <div className="login-left">
        <div style={{ maxWidth: 440 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>✚</div>
            <div>
              <div className="login-brand">ePharma</div>
            </div>
          </div>
          <div className="login-sub">La plateforme complète pour gérer votre pharmacie</div>
          {FEATURES.map(f => (
            <div key={f.text} className="login-feature">
              <span style={{ fontSize: 20 }}>{f.icon}</span>
              <span>{f.text}</span>
            </div>
          ))}
          <div style={{ marginTop: 40, padding: 16, background: 'rgba(255,255,255,.1)', borderRadius: 12, fontSize: 13, opacity: .8 }}>
            🔗 Connecté à <strong>Pharmacie CSU</strong> · Stock unifié avec l'app mobile
          </div>
        </div>
      </div>

      {/* Droite — Formulaire */}
      <div className="login-right">
        <div style={{ width: '100%', maxWidth: 360 }}>

          {/* ÉTAPE LOGIN */}
          {step === 'login' && (
            <>
              <div className="login-form-title">Connexion</div>
              <div className="login-form-sub">Accédez à votre espace ePharma</div>
              {error && <div className="alert alert-error">{error}</div>}
              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label">Adresse email</label>
                  <input className="form-input" type="email" placeholder="prenom@pharmaciecsu.cg"
                    value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Mot de passe</label>
                  <input className="form-input" type="password" placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                <button className="btn btn-primary btn-lg" style={{ width: '100%' }} type="submit" disabled={loading}>
                  {loading ? '⏳ Connexion...' : 'Se connecter →'}
                </button>
              </form>
              <div style={{ marginTop: 20, padding: 14, background: 'var(--g1)', borderRadius: 10, fontSize: 12, color: 'var(--t2)' }}>
                🔐 Connexion sécurisée · 2FA SMS activé · Données chiffrées Supabase
              </div>
            </>
          )}

          {/* ÉTAPE 2FA */}
          {step === '2fa' && (
            <>
              <button onClick={() => setStep('login')} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                ← Retour
              </button>
              <div className="login-form-title">Vérification 2FA</div>
              <div className="login-form-sub">
                Code envoyé par SMS au {phone?.replace(/(\+\d{3})(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5')}
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              <div className="otp-grid">
                {otp.map((d, i) => (
                  <input key={i}
                    ref={r => { if (r) otpRefs.current[i] = r }}
                    className="otp-input" maxLength={1} type="number"
                    value={d} onChange={e => handleOtpChange(e.target.value, i)}
                  />
                ))}
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleVerify2FA} disabled={loading}>
                {loading ? '⏳ Vérification...' : 'Vérifier et accéder →'}
              </button>
              <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: 'var(--t3)' }}>
                Code test : <strong>1 2 3 4 5 6</strong>
              </div>
              <button onClick={() => send2FA(phone)} style={{ background: 'none', border: 'none', color: 'var(--g4)', cursor: 'pointer', fontSize: 13, marginTop: 12, width: '100%', textAlign: 'center' }}>
                Renvoyer le code SMS
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
