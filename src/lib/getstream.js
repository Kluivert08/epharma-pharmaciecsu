import { StreamChat } from 'stream-chat'

const STREAM_API_KEY    = 'mfchruy5cs8d'
const STREAM_API_SECRET = '6g4fac57q56tzgx7meudh3pdzhzxpqxc2tkc6e88sfupupcn7p7qm2bnqzwhnhpm'

let clientInstance = null

async function generateToken(userId) {
  const header  = { alg: 'HS256', typ: 'JWT' }
  const payload = { user_id: userId, iat: Math.floor(Date.now() / 1000) }

  function b64url(obj) {
    return btoa(JSON.stringify(obj))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  }

  const data = `${b64url(header)}.${b64url(payload)}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(STREAM_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )

  const sig    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${data}.${sigB64}`
}

// getstream_id = UUID Supabase = ID GetStream (mis à jour via SQL)
export function getStreamUserId(staff) {
  if (staff?.getstream_id) return staff.getstream_id
  return staff.id
}

export async function initStreamClient(staff) {
  const userId = getStreamUserId(staff)

  if (clientInstance && clientInstance.userID === userId) return clientInstance
  if (clientInstance) await disconnectStream()

  const client = StreamChat.getInstance(STREAM_API_KEY)
  const token  = await generateToken(userId)

  await client.connectUser({
    id:           userId,
    name:         `${staff.prenom} ${staff.nom}`,
    role:         'user',
    image:        null,
    epharma_role: staff.role,
    pharmacie:    'Pharmacie CSU',
  }, token)

  clientInstance = client
  console.log(`✅ GetStream : ${userId} — ${staff.prenom} ${staff.nom}`)
  return client
}

export async function disconnectStream() {
  if (clientInstance) {
    try { await clientInstance.disconnectUser() } catch (e) {}
    clientInstance = null
  }
}

export function getStreamClient() { return clientInstance }

export { STREAM_API_KEY }
