import { createHmac, timingSafeEqual } from 'crypto'

// ─────────────────────────────────────────────────────────────
// Şifreli link "unlock" token'ı — HMAC İMZALI.
//
// GÜVENLİK: Eski hali imzasız base64(linkId:timestamp) idi → saldırgan
// herhangi bir linkId için token uydurup şifreli linkin kilidini açabiliyordu.
// Artık token BETTER_AUTH_SECRET ile HMAC-SHA256 imzalanıyor; imzası geçersiz
// token reddedilir. Tek kaynak: hem üretim (link.service) hem doğrulama
// (public.helpers) buradan kullanır.
//
// Token formatı: base64url("linkId:timestamp:hmac")
//   hmac = HMAC-SHA256("linkId:timestamp", BETTER_AUTH_SECRET)
// ─────────────────────────────────────────────────────────────

const TOKEN_MAX_AGE_MS = 30 * 60 * 1000  // 30 dakika

function sign(payload: string): string {
  const secret = process.env.BETTER_AUTH_SECRET || ''
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function createUnlockToken(linkId: string): string {
  const payload = `${linkId}:${Date.now()}`
  const sig = sign(payload)
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export function verifyUnlockToken(token: string, linkId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split(':')
    // cuid() ve timestamp ':' içermez → tam 3 parça beklenir
    if (parts.length !== 3) return false

    const [tokenLinkId, timestampStr, sig] = parts
    if (tokenLinkId !== linkId) return false

    const timestamp = parseInt(timestampStr, 10)
    if (isNaN(timestamp)) return false
    if (Date.now() - timestamp > TOKEN_MAX_AGE_MS) return false  // süresi geçmiş

    // İmza doğrula — timing-safe karşılaştırma
    const expected = sign(`${tokenLinkId}:${timestampStr}`)
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
