import { FastifyInstance } from 'fastify'
import { requireAuth }    from '../auth/auth.middleware'
import { getProfileContext } from '../../utils/context'
import { ErrorCodes }     from '@taplink/validations'
import {
  getLeads, getSubscribers, exportSubscribersCsv, exportLeadsCsv,
} from './leads.service'

export async function leadsRoutes(fastify: FastifyInstance) {

  // GET /api/leads?page=1
  fastify.get('/api/leads', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    const { page } = req.query as { page?: string }
    const data = await getLeads(ctx.profileId, Number(page ?? 1))
    return reply.send({ success: true, data })
  })

  // GET /api/leads/export — CSV
  fastify.get('/api/leads/export', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    const csv = await exportLeadsCsv(ctx.profileId)
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="leads.csv"')
    return reply.send(csv)
  })

  // GET /api/leads/subscribers?page=1
  fastify.get('/api/leads/subscribers', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    const { page } = req.query as { page?: string }
    const data = await getSubscribers(ctx.profileId, Number(page ?? 1))
    return reply.send({ success: true, data })
  })

  // GET /api/leads/subscribers/export — CSV
  fastify.get('/api/leads/subscribers/export', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    const csv = await exportSubscribersCsv(ctx.profileId)
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="subscribers.csv"')
    return reply.send(csv)
  })
}
