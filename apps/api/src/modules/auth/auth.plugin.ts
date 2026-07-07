import fp from 'fastify-plugin'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { auth } from './auth.instance'
import { authRateLimit } from './auth.ratelimit'

// ─────────────────────────────────────────────────────────────
// Fastify (Node) isteğini Better Auth'un beklediği Web Request'e çevirir.
//
// NOT (doküman düzeltmesi): Doküman `auth.handler(request.raw)` kullanıyordu.
// Sorun: request.raw bir Node IncomingMessage — Web Request DEĞİL, Better Auth
// onu işleyemez. Ayrıca Fastify JSON body'yi zaten okuduğu için raw stream
// boşalmış olur. Çözüm: Fastify'ın parse ettiği body'den Web Request'i yeniden
// kuruyoruz (global fetch API'si — Node 18+ ile gelir).
// ─────────────────────────────────────────────────────────────
// Fastify'ın düz header objesini Web `Headers`'a çevirir.
// Better Auth hem getSession hem handler için Headers nesnesi ister.
function toHeaders(request: FastifyRequest, skipContentLength = false): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue
    if (skipContentLength && key.toLowerCase() === 'content-length') continue
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
    else headers.set(key, String(value))
  }
  return headers
}

function toWebRequest(request: FastifyRequest): Request {
  const url = `${request.protocol}://${request.headers.host}${request.url}`

  // content-length yeniden hesaplanacak — eski değeri taşıma (body re-serialize edilir)
  const headers = toHeaders(request, true)

  const method = request.method
  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD' && request.body != null) {
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
  }

  return new Request(url, { method, headers, body })
}

// Better Auth'un Web Response'unu Fastify reply'a yazar.
// Set-Cookie özel: birden fazla cookie olabilir — getSetCookie() ile diziyi al.
async function sendWebResponse(reply: FastifyReply, res: Response): Promise<void> {
  reply.status(res.status)

  const setCookies = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()

  res.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return // aşağıda ayrı ele alınıyor
    reply.header(key, value)
  })

  if (setCookies && setCookies.length > 0) {
    reply.header('set-cookie', setCookies)
  }

  const text = await res.text()
  reply.send(text)
}

export default fp(async (fastify) => {
  // Her istekte session'ı yükle — giriş gerektirmeyen yerlerde null gelir (normal)
  fastify.addHook('preHandler', async (request) => {
    try {
      const session = await auth.api.getSession({
        headers: toHeaders(request),
      })
      request.user = session?.user ?? null
      request.session = session?.session ?? null
    } catch {
      request.user = null
      request.session = null
    }
  })

  // Tüm auth route'ları tek catch-all'da — rate limit uygula, sonra Better Auth'a delege et
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const path = request.url.split('?')[0]

      // Kritik endpoint'lere brute-force koruması (Step 11'de merkezi sisteme geçecek)
      if (request.method === 'POST') {
        let action: 'sign-in' | 'sign-up' | 'forget-password' | null = null
        if (path.endsWith('/sign-in/email'))      action = 'sign-in'
        else if (path.endsWith('/sign-up/email')) action = 'sign-up'
        else if (path.includes('/forget-password')) action = 'forget-password'

        if (action) {
          const allowed = await authRateLimit(action, request, reply)
          if (!allowed) return // 429 zaten gönderildi
        }
      }

      const webReq = toWebRequest(request)
      const webRes = await auth.handler(webReq)
      await sendWebResponse(reply, webRes)
    },
  })

  fastify.log.info('[AUTH] Auth modülü yüklendi')
})
