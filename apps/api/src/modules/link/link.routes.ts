import { FastifyInstance } from 'fastify'
import { requireAuth } from '../auth/auth.middleware'
import { getProfileContext } from '../../utils/context'
import {
  CreateLinkSchema, UpdateLinkSchema,
  ReorderLinksSchema, UnlockLinkSchema,
  ErrorCodes,
} from '@taplink/validations'
import {
  getLinksByProfileId, createLink, updateLink,
  deleteLink, reorderLinks, unlockLink,
} from './link.service'

export async function linkRoutes(fastify: FastifyInstance) {

  // ─────────────────────────────────────────
  // GET /api/links — Profil sahibinin bloklarını listele
  // ─────────────────────────────────────────
  fastify.get('/api/links', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    const links = await getLinksByProfileId(ctx.profileId)

    // password alanını hasPassword boolean'ına dönüştür — hash asla dışarı çıkmaz
    const sanitized = links.map((link) => {
      const { password, ...rest } = link as typeof link & { password?: string | null }
      return {
        ...rest,
        hasPassword: !!password,
        children: link.children?.map((child) => ({
          ...child,
          hasPassword: false, // koleksiyon çocuklarında şifre yok (select'te de yok)
        })),
      }
    })

    return reply.send({ success: true, data: sanitized })
  })

  // ─────────────────────────────────────────
  // POST /api/links — Yeni block oluştur
  // ─────────────────────────────────────────
  fastify.post('/api/links', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    const parsed = CreateLinkSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        code: ErrorCodes.VALIDATION_ERROR,
        message: parsed.error.errors[0]?.message,
      })
    }

    const { error, link } = await createLink(ctx.profileId, ctx.plan, parsed.data)

    if (error) {
      const status = error === ErrorCodes.SUBSCRIPTION_REQUIRED ? 403 : 400
      return reply.status(status).send({ success: false, code: error })
    }

    return reply.status(201).send({ success: true, data: link })
  })

  // ─────────────────────────────────────────
  // PATCH /api/links/:id — Block güncelle
  // ─────────────────────────────────────────
  fastify.patch('/api/links/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    const { id } = req.params as { id: string }
    const parsed = UpdateLinkSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        code: ErrorCodes.VALIDATION_ERROR,
        message: parsed.error.errors[0]?.message,
      })
    }

    const { error, link } = await updateLink(id, ctx.profileId, ctx.plan, parsed.data)

    if (error) {
      const status = error === ErrorCodes.LINK_NOT_FOUND ? 404
                   : error === ErrorCodes.SUBSCRIPTION_REQUIRED ? 403 : 400
      return reply.status(status).send({ success: false, code: error })
    }

    // hash'i dışarı verme
    const { password, ...rest } = link! as typeof link & { password?: string | null }
    return reply.send({ success: true, data: { ...rest, hasPassword: !!password } })
  })

  // ─────────────────────────────────────────
  // DELETE /api/links/:id — Block sil
  // ─────────────────────────────────────────
  fastify.delete('/api/links/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    const { id } = req.params as { id: string }

    const { error } = await deleteLink(id, ctx.profileId)
    if (error) {
      return reply.status(404).send({ success: false, code: error })
    }

    return reply.status(204).send()
  })

  // ─────────────────────────────────────────
  // PUT /api/links/reorder — Toplu sıralama
  // ─────────────────────────────────────────
  fastify.put('/api/links/reorder', { preHandler: [requireAuth] }, async (req, reply) => {
    const ctx = await getProfileContext(req.user!.id)
    if (!ctx) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    const parsed = ReorderLinksSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ success: false, code: ErrorCodes.VALIDATION_ERROR })
    }

    const { error } = await reorderLinks(ctx.profileId, parsed.data)
    if (error) {
      return reply.status(404).send({ success: false, code: error })
    }

    return reply.send({ success: true })
  })

  // ─────────────────────────────────────────
  // POST /api/links/:id/unlock — Şifreli link girişi
  // Oturum gerektirmez — ziyaretçi kullanır
  // ─────────────────────────────────────────
  fastify.post('/api/links/:id/unlock', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = UnlockLinkSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ success: false, code: ErrorCodes.VALIDATION_ERROR })
    }

    const { error, token } = await unlockLink(id, parsed.data.password)

    if (error) {
      const status = error === ErrorCodes.LINK_NOT_FOUND ? 404 : 400
      return reply.status(status).send({ success: false, code: error })
    }

    return reply.send({ success: true, data: { token } })
  })
}
