import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { checkRateLimit } from '../lib/rate-limit'

// Giriş yapmış kullanıcıların dashboard isteklerini 'general' grubu altında sınırlar.
// public (/api/p/), auth (/api/auth/) ve health kendi limitlerini kullanır → muaf.
async function rateLimitPlugin(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0]

    if (
      url.startsWith('/api/p/')    ||   // public + forms (kendi limitleri)
      url.startsWith('/api/auth/') ||   // auth (Step 04 limiti)
      url === '/api/health'
    ) {
      return
    }

    // onRequest preHandler'dan ÖNCE çalışır → req.user henüz yok, IP'ye düşer (kabul edilebilir)
    const userId = (req as any).user?.id
    const blocked = await checkRateLimit(req, reply, 'general', userId)
    if (blocked) return reply  // hook'tan erken çık
  })
}

export default fp(rateLimitPlugin, { name: 'rate-limit' })
