import { FastifyRequest } from 'fastify'

// ─────────────────────────────────────────
// ZİYARETÇİ IP ADRESİ
// Cloudflare arkasında gerçek IP CF-Connecting-IP header'ındadır
// ─────────────────────────────────────────
export function getVisitorIp(req: FastifyRequest): string {
  const cfIp = req.headers['cf-connecting-ip']
  if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp

  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')
    return ips[0].trim()
  }

  return req.socket.remoteAddress ?? 'unknown'
}

// ─────────────────────────────────────────
// CİHAZ TİPİ — User-Agent'tan basit tespit (analitik için yaklaşık yeterli)
// ─────────────────────────────────────────
export function getDeviceType(req: FastifyRequest): string {
  const ua = (req.headers['user-agent'] ?? '').toLowerCase()
  if (/tablet|ipad/.test(ua))            return 'tablet'
  if (/mobile|android|iphone/.test(ua))  return 'mobile'
  return 'desktop'
}

// ─────────────────────────────────────────
// REFERRER — sadece domain (gizlilik), max 100 karakter
// ─────────────────────────────────────────
export function getReferrer(req: FastifyRequest): string | null {
  const ref = req.headers['referer'] ?? req.headers['referrer']
  if (!ref) return null
  const refStr = Array.isArray(ref) ? ref[0] : ref
  try {
    const url = new URL(refStr)
    return url.hostname.slice(0, 100)
  } catch {
    return null
  }
}

// ─────────────────────────────────────────
// ÜLKE KODU — Cloudflare CF-IPCountry header'ı (2 harf ISO)
// Cloudflare arkasında değilsek null (dev ortamı)
// ─────────────────────────────────────────
export function getCountry(req: FastifyRequest): string | null {
  const country = req.headers['cf-ipcountry']
  if (!country) return null
  const code = Array.isArray(country) ? country[0] : country
  if (code === 'XX' || code === 'T1') return null  // bilinmeyen / Tor
  return code.toUpperCase().slice(0, 2)
}

// ─────────────────────────────────────────
// ŞİFRE TOKEN DOĞRULAMA
// Step 06 unlock endpoint'i base64("linkId:timestamp") üretir, 30 dk geçerli
// ─────────────────────────────────────────
const TOKEN_MAX_AGE_MS = 30 * 60 * 1000  // 30 dakika

export function verifyUnlockToken(token: string, linkId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const [tokenId, timestampStr] = decoded.split(':')
    const timestamp = parseInt(timestampStr, 10)

    if (tokenId !== linkId) return false
    if (isNaN(timestamp))   return false
    if (Date.now() - timestamp > TOKEN_MAX_AGE_MS) return false

    return true
  } catch {
    return false
  }
}
