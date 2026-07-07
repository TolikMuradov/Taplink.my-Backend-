import { FastifyInstance } from 'fastify'
import { requireAuth }    from '../auth/auth.middleware'
import {
  getUnreadCount, getNotifications, markAsRead, markAllAsRead,
} from './notifications.service'

export async function notificationsRoutes(fastify: FastifyInstance) {

  // GET /api/notifications/count — sadece sayı (polling için hafif)
  fastify.get('/api/notifications/count', { preHandler: [requireAuth] }, async (req, reply) => {
    const count = await getUnreadCount(req.user!.id)
    return reply.send({ success: true, data: { count } })
  })

  // GET /api/notifications?page=1 — liste
  fastify.get('/api/notifications', { preHandler: [requireAuth] }, async (req, reply) => {
    const { page } = req.query as { page?: string }
    const data = await getNotifications(req.user!.id, Number(page ?? 1))
    return reply.send({ success: true, data })
  })

  // PATCH /api/notifications/:id/read — tekil okundu
  fastify.patch('/api/notifications/:id/read', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const ok = await markAsRead(id, req.user!.id)
    if (!ok) return reply.status(404).send({ success: false, code: 'NOT_FOUND' })
    return reply.send({ success: true })
  })

  // PATCH /api/notifications/read-all — hepsini okundu
  fastify.patch('/api/notifications/read-all', { preHandler: [requireAuth] }, async (req, reply) => {
    await markAllAsRead(req.user!.id)
    return reply.send({ success: true })
  })
}
