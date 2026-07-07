import { FastifyInstance } from 'fastify'
import { requireAuth } from '../auth/auth.middleware'
import { requirePlan } from '../../utils/plan'
import { getProfileContext } from '../../utils/context'
import { ErrorCodes } from '@taplink/validations'
import { getOverview, getLinkStats, getBreakdown } from './analytics.service'

export async function analyticsRoutes(fastify: FastifyInstance) {

  // ─────────────────────────────────────────
  // GET /api/analytics/overview — toplam görüntüleme/tıklama + günlük grafik
  // FREE: 30 gün | PRO: 365 gün
  // ─────────────────────────────────────────
  fastify.get('/api/analytics/overview', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    const data = await getOverview(ctx.profileId, ctx.plan)
    return reply.send({ success: true, data })
  })

  // ─────────────────────────────────────────
  // GET /api/analytics/links — link bazlı tıklama + yüzde
  // FREE: 30 gün | PRO: 365 gün
  // ─────────────────────────────────────────
  fastify.get('/api/analytics/links', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    const data = await getLinkStats(ctx.profileId, ctx.plan)
    return reply.send({ success: true, data })
  })

  // ─────────────────────────────────────────
  // GET /api/analytics/breakdown — ülke/cihaz/referrer/saat
  // SADECE PRO — FREE'ye 403
  // ─────────────────────────────────────────
  fastify.get('/api/analytics/breakdown', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    // Plan kontrolü — FREE bu endpoint'e erişemez
    if (requirePlan(ctx.plan, 'PRO', reply)) return

    const data = await getBreakdown(ctx.profileId)
    return reply.send({ success: true, data })
  })
}
