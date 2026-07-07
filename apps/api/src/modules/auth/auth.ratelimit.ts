import { redis } from '../../lib/redis'   // ← paylaşımlı client — tekrar oluşturma
import { FastifyRequest, FastifyReply } from 'fastify'

// IP başına belirli sürede kaç istek yapılabilir
const LIMITS = {
  'sign-in':         { max: 5, windowSec: 60 * 15 },  // 15 dakikada 5 deneme
  'sign-up':         { max: 3, windowSec: 60 * 60 },  // Saatte 3 kayıt
  'forget-password': { max: 3, windowSec: 60 * 60 },  // Saatte 3 istek
} as const

type LimitKey = keyof typeof LIMITS

// İstek yapan IP'yi al — proxy arkasındaysa X-Forwarded-For'a bak
function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  return request.ip || 'unknown'
}

export async function authRateLimit(
  action: LimitKey,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const ip = getClientIp(request)
  const key = `taplink:ratelimit:auth:${action}:${ip}`
  const limit = LIMITS[action]

  const current = await redis.incr(key)

  // İlk istekte TTL ayarla
  if (current === 1) {
    await redis.expire(key, limit.windowSec)
  }

  if (current > limit.max) {
    const ttl = await redis.ttl(key)
    const minutesLeft = Math.ceil(ttl / 60)

    request.log.warn(
      { ip, action, attempts: current },
      `[RATELIMIT] Çok fazla deneme: ${action} — IP: ${ip}`
    )

    reply.status(429).send({
      success: false,
      code: 'TOO_MANY_REQUESTS',
      message: `Çok fazla deneme. ${minutesLeft} dakika sonra tekrar deneyin.`,
    })

    return false // Limit aşıldı, işlemi durdur
  }

  return true // Devam et
}
