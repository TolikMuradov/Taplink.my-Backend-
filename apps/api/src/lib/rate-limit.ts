import { Ratelimit } from '@upstash/ratelimit'
import { redis }     from './redis'   // paylaşımlı client — yeni Redis() açma
import { FastifyRequest, FastifyReply } from 'fastify'

export { redis }

// ─────────────────────────────────────────
// LİMİT GRUPLARI — sliding window (Upstash Lua, atomik)
// ─────────────────────────────────────────
export const limiters = {
  // AUTH — brute-force (Step 04 auth.ratelimit hâlâ aktif; bu grup ileride birleştirilebilir)
  auth:     new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '15 m'), prefix: 'taplink:rl:auth', analytics: true }),
  register: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '1 h'),  prefix: 'taplink:rl:register', analytics: true }),
  // FORM — spam koruması (en kritik: bot saniyede yüzlerce form atabilir)
  form:     new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '5 m'),  prefix: 'taplink:rl:form', analytics: true }),
  // UPLOAD — R2 maliyet koruması
  upload:   new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 h'), prefix: 'taplink:rl:upload', analytics: true }),
  // PUBLIC — ziyaretçi profil/tıklama (yüksek limit ama bot koruması)
  public:   new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(120, '1 m'), prefix: 'taplink:rl:public', analytics: true }),
  // GENERAL — giriş yapmış kullanıcıların dashboard istekleri
  general:  new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, '1 m'), prefix: 'taplink:rl:general', analytics: true }),
} as const

export type LimiterKey = keyof typeof limiters

// Ziyaretçi IP — Cloudflare arkasında CF-Connecting-IP güvenilir
function getIp(req: FastifyRequest): string {
  const cfIp = req.headers['cf-connecting-ip']
  if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp

  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
    return first.split(',')[0].trim()
  }
  return req.socket.remoteAddress ?? 'unknown'
}

// ─────────────────────────────────────────
// ANA YARDIMCI — route handler içinde:
//   if (await checkRateLimit(req, reply, 'form')) return
// ─────────────────────────────────────────
export async function checkRateLimit(
  req:    FastifyRequest,
  reply:  FastifyReply,
  group:  LimiterKey,
  identifier?: string
): Promise<boolean> {
  // Dev kolaylığı — SADECE geliştirmede. Production .env'inde ASLA true olmamalı.
  if (process.env.DISABLE_RATE_LIMIT === 'true') return false

  const id      = identifier ?? getIp(req)
  const limiter = limiters[group]

  const { success, limit, remaining, reset } = await limiter.limit(id)

  reply.header('X-RateLimit-Limit',     String(limit))
  reply.header('X-RateLimit-Remaining', String(remaining))
  reply.header('X-RateLimit-Reset',     String(reset))

  if (!success) {
    const retryAfterSec = Math.ceil((reset - Date.now()) / 1000)
    reply.header('Retry-After', String(retryAfterSec))

    reply.status(429).send({
      success: false,
      code:    'TOO_MANY_REQUESTS',
      message: `Çok fazla istek. ${retryAfterSec} saniye sonra tekrar deneyin.`,
    })

    console.warn(`[RateLimit] ${group} limit aşıldı — id: ${id}, path: ${req.url}`)
    return true  // engellendi — handler return etmeli
  }

  return false
}
