import React, { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

// ── Composant QR Code Scanner réel ───────────────────────────
// Utilise la caméra du PC/tablette via html5-qrcode
// Fallback : saisie manuelle du numéro d'assuré

export default function QRScanner({ onScan, onClose, titre = 'Scanner la carte assuré' }) {
  const [scanning,  setScanning]  = useState(false)
  const [error,     setError]     = useState(null)
  const [manual,    setManual]    = useState('')
  const [cameras,   setCameras]   = useState([])
  const [camId,     setCamId]     = useState(null)
  const scannerRef                 = useRef(null)
  const html5QrRef                 = useRef(null)

  useEffect(() => {
    // Lister les caméras disponibles
    Html5Qrcode.getCameras()
      .then(devices => {
        if (devices?.length) {
          setCameras(devices)
          // Préférer la caméra arrière si disponible
          const back = devices.find(d =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('arrière') ||
            d.label.toLowerCase().includes('environment')
          )
          setCamId(back?.id || devices[0].id)
        }
      })
      .catch(() => setError('Impossible d\'accéder aux caméras'))
  }, [])

  async function startScan() {
    if (!camId) { setError('Aucune caméra détectée'); return }
    setError(null)

    try {
      html5QrRef.current = new Html5Qrcode('qr-reader')
      await html5QrRef.current.start(
        camId,
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          // QR Code scanné avec succès
          stopScan()
          onScan(decodedText)
        },
        () => {} // Erreur de scan ignorée (scan en cours)
      )
      setScanning(true)
    } catch (e) {
      setError(`Erreur caméra : ${e.message || 'Permission refusée'}`)
    }
  }

  async function stopScan() {
    if (html5QrRef.current && scanning) {
      try { await html5QrRef.current.stop() } catch (e) {}
      setScanning(false)
    }
  }

  useEffect(() => {
    return () => { stopScan() }
  }, [])

  return (
    <div style={{ padding: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g4)', marginBottom: 14 }}>
        {titre}
      </div>

      {/* Zone caméra */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <div
          id="qr-reader"
          ref={scannerRef}
          style={{
            width: '100%',
            borderRadius: 12,
            overflow: 'hidden',
            border: `2px solid ${scanning ? 'var(--g3)' : 'var(--border)'}`,
            minHeight: scanning ? 'auto' : 0,
            transition: 'border-color .3s',
          }}
        />

        {/* Placeholder quand pas encore lancé */}
        {!scanning && (
          <div style={{
            width: '100%', height: 200, borderRadius: 12,
            background: 'var(--g1)', border: '2px dashed var(--g2)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 48 }}>📷</span>
            <div style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center' }}>
              {cameras.length > 0
                ? 'Cliquez sur "Démarrer le scan" pour activer la caméra'
                : 'Recherche des caméras...'}
            </div>
          </div>
        )}

        {/* Overlay cadre de scan */}
        {scanning && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            pointerEvents: 'none', borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 200, height: 200,
              border: '3px solid var(--g3)',
              borderRadius: 12,
              boxShadow: '0 0 0 1000px rgba(0,0,0,.4)',
            }}>
              {/* Coins animés */}
              {[
                { top:0, left:0, borderRight:'none', borderBottom:'none' },
                { top:0, right:0, borderLeft:'none',  borderBottom:'none' },
                { bottom:0, left:0, borderRight:'none', borderTop:'none' },
                { bottom:0, right:0, borderLeft:'none',  borderTop:'none' },
              ].map((s, i) => (
                <div key={i} style={{
                  position: 'absolute', width: 20, height: 20,
                  border: '3px solid #fff', borderRadius: 3, ...s,
                }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sélection caméra si plusieurs */}
      {cameras.length > 1 && (
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Caméra</label>
          <select className="form-input form-select" value={camId || ''}
            onChange={e => { stopScan(); setCamId(e.target.value) }}>
            {cameras.map(c => (
              <option key={c.id} value={c.id}>{c.label || `Caméra ${c.id.slice(0,8)}`}</option>
            ))}
          </select>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Boutons caméra */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {!scanning ? (
          <button className="btn btn-primary" style={{ flex: 1 }}
            onClick={startScan} disabled={cameras.length === 0}>
            📷 Démarrer le scan
          </button>
        ) : (
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={stopScan}>
            ⏹ Arrêter
          </button>
        )}
      </div>

      {/* Séparateur */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 12, color: 'var(--t3)', flexShrink: 0 }}>ou saisie manuelle</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Saisie manuelle */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="form-input"
          placeholder="N° assuré, carte ou code-barres"
          value={manual}
          onChange={e => setManual(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && manual.trim()) {
              stopScan()
              onScan(manual.trim())
            }
          }}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary"
          onClick={() => { stopScan(); onScan(manual.trim()) }}
          disabled={!manual.trim()}>
          →
        </button>
      </div>

      <button className="btn btn-outline btn-sm"
        style={{ width: '100%', marginTop: 10 }}
        onClick={() => { stopScan(); onClose() }}>
        Annuler
      </button>
    </div>
  )
}
