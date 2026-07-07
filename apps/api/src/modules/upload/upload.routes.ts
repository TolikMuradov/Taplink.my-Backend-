import { FastifyInstance } from 'fastify'
import { requireAuth } from '../auth/auth.middleware'
import { prisma } from '@taplink/db'
import { processAndUpload, deleteFromR2 } from './upload.service'
import { invalidateProfileCacheByUserId } from '../../lib/cache'
import { checkRateLimit } from '../../lib/rate-limit'

// @fastify/multipart app.ts'de bir kez register edilir (aşağıya bak) —
// bu dosyada tekrar register etme.

export async function uploadRoutes(fastify: FastifyInstance) {

  // ─────────────────────────────────────────
  // POST /api/upload/avatar
  // Frontend: FormData ile croppedBlob → 'file' alanı
  // ─────────────────────────────────────────
  fastify.post('/api/upload/avatar', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user!
    if (await checkRateLimit(req, reply, 'upload', user.id)) return

    const data = await req.file()
    if (!data) {
      return reply.status(400).send({ success: false, code: 'VALIDATION_ERROR' })
    }

    const buffer = await data.toBuffer()

    // Mevcut avatarı al — başarıyla yüklenince eski silinecek
    const profile = await prisma.profile.findUnique({
      where:  { userId: user.id },
      select: { avatarUrl: true },
    })

    const { url, error } = await processAndUpload(user.id, 'avatar', buffer, data.mimetype)

    if (error) {
      const status = error === 'FILE_TOO_LARGE' || error === 'INVALID_FILE_TYPE' ? 400 : 500
      return reply.status(status).send({ success: false, code: error })
    }

    await prisma.profile.update({
      where: { userId: user.id },
      data:  { avatarUrl: url },
    })

    if (profile?.avatarUrl) {
      await deleteFromR2(profile.avatarUrl)
    }

    await invalidateProfileCacheByUserId(user.id)
    return reply.send({ success: true, data: { url } })
  })

  // ─────────────────────────────────────────
  // POST /api/upload/background
  // ─────────────────────────────────────────
  fastify.post('/api/upload/background', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user!
    if (await checkRateLimit(req, reply, 'upload', user.id)) return

    const data = await req.file()
    if (!data) {
      return reply.status(400).send({ success: false, code: 'VALIDATION_ERROR' })
    }

    const buffer = await data.toBuffer()

    const profile = await prisma.profile.findUnique({
      where:  { userId: user.id },
      select: { backgroundUrl: true },
    })

    const { url, error } = await processAndUpload(user.id, 'background', buffer, data.mimetype)

    if (error) {
      const status = error === 'FILE_TOO_LARGE' || error === 'INVALID_FILE_TYPE' ? 400 : 500
      return reply.status(status).send({ success: false, code: error })
    }

    await prisma.profile.update({
      where: { userId: user.id },
      data:  { backgroundUrl: url },
    })

    if (profile?.backgroundUrl) {
      await deleteFromR2(profile.backgroundUrl)
    }

    await invalidateProfileCacheByUserId(user.id)
    return reply.send({ success: true, data: { url } })
  })

  // ─────────────────────────────────────────
  // POST /api/upload/card-image
  // Card görseli (albüm kapağı, ürün vb.). Yükleme sonrası frontend bu URL'yi
  // ilgili link'in metadata.imageUrl'üne PATCH ile ekler.
  // Eski görsel silme Step 08'de link.service güncellemesiyle eklenir.
  // ─────────────────────────────────────────
  fastify.post('/api/upload/card-image', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user!
    if (await checkRateLimit(req, reply, 'upload', user.id)) return

    const data = await req.file()
    if (!data) {
      return reply.status(400).send({ success: false, code: 'VALIDATION_ERROR' })
    }

    const buffer = await data.toBuffer()

    const { url, error } = await processAndUpload(user.id, 'card', buffer, data.mimetype)

    if (error) {
      const status = error === 'FILE_TOO_LARGE' || error === 'INVALID_FILE_TYPE' ? 400 : 500
      return reply.status(status).send({ success: false, code: error })
    }

    return reply.send({ success: true, data: { url } })
  })

  // ─────────────────────────────────────────
  // DELETE /api/upload/avatar — Avatarı kaldır
  // ─────────────────────────────────────────
  fastify.delete('/api/upload/avatar', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user!

    const profile = await prisma.profile.findUnique({
      where:  { userId: user.id },
      select: { avatarUrl: true },
    })

    if (profile?.avatarUrl) {
      await deleteFromR2(profile.avatarUrl)
      await prisma.profile.update({
        where: { userId: user.id },
        data:  { avatarUrl: null },
      })
      await invalidateProfileCacheByUserId(user.id)
    }

    return reply.send({ success: true })
  })

  // ─────────────────────────────────────────
  // DELETE /api/upload/background — Arkaplanı kaldır
  // ─────────────────────────────────────────
  fastify.delete('/api/upload/background', { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user!

    const profile = await prisma.profile.findUnique({
      where:  { userId: user.id },
      select: { backgroundUrl: true },
    })

    if (profile?.backgroundUrl) {
      await deleteFromR2(profile.backgroundUrl)
      await prisma.profile.update({
        where: { userId: user.id },
        data:  { backgroundUrl: null },
      })
      await invalidateProfileCacheByUserId(user.id)
    }

    return reply.send({ success: true })
  })
}
