import { FastifyInstance } from 'fastify'
import { prisma } from '@taplink/db'
import { requireAuth } from '../auth/auth.middleware'
import { UpdateProfileSchema, ErrorCodes } from '@taplink/validations'
import { CURATED_TEMPLATES } from './profile.templates'
import {
  getProfileByUserId,
  updateProfile,
  resetProfile,
} from './profile.service'

export async function profileRoutes(fastify: FastifyInstance) {

  // Kendi profilimi getir
  fastify.get(
    '/api/profile/me',
    { preHandler: requireAuth },
    async (request, reply) => {
      const profile = await getProfileByUserId(request.user!.id)

      if (!profile) {
        // Profil yok: Step 04'teki hook bir şekilde tetiklenmedi.
        // Frontend bunu "onboarding" sinyali olarak kullanır (404 → /dashboard/setup).
        return reply.status(404).send({
          success: false,
          code: ErrorCodes.PROFILE_NOT_FOUND,
        })
      }

      return reply.send({ success: true, data: profile })
    }
  )

  // Profilimi güncelle
  fastify.patch(
    '/api/profile/me',
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = UpdateProfileSchema.safeParse(request.body)

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          code: ErrorCodes.VALIDATION_ERROR,
          message: parsed.error.errors[0]?.message,
        })
      }

      // Plan bilgisini veritabanından al — session plan içermeyebilir
      const dbUser = await prisma.user.findUnique({
        where:  { id: request.user!.id },
        select: { plan: true },
      })
      const userPlan = dbUser?.plan ?? 'FREE'

      const result = await updateProfile(request.user!.id, userPlan, parsed.data)

      if (!result.success) {
        return reply.status(403).send(result)
      }

      fastify.log.info(
        { userId: request.user!.id },
        '[PROFILE] Profil güncellendi'
      )

      return reply.send({ success: true, data: { message: 'Profil güncellendi' } })
    }
  )

  // Profilimi sıfırla — tüm özelleştirmeleri kaldır, varsayılan tasarıma döner
  fastify.delete(
    '/api/profile/me/customization',
    { preHandler: requireAuth },
    async (request, reply) => {
      await resetProfile(request.user!.id)

      fastify.log.info(
        { userId: request.user!.id },
        '[PROFILE] Profil sıfırlandı'
      )

      return reply.send({ success: true, data: { message: 'Profil sıfırlandı' } })
    }
  )

  // Curated şablon listesi — giriş gerekmez
  // Frontend bu listeyi kullanarak şablon galerisini doldurur (PRO olanlar kilitli gösterilir)
  fastify.get('/api/templates', async (_request, reply) => {
    const templates = CURATED_TEMPLATES.map(t => ({
      id:         t.id,
      name:       t.name,
      plan:       t.plan,
      previewUrl: t.previewUrl,
      design:     t.design,
    }))
    return reply.send({ success: true, data: templates })
  })

  // Username müsait mi kontrol et — kayıt olmadan da sorulabilir
  fastify.get(
    '/api/profile/check-username/:username',
    async (request, reply) => {
      const { username } = request.params as { username: string }

      if (!username || username.length < 3 || username.length > 30) {
        return reply.status(400).send({
          success: false,
          code: ErrorCodes.INVALID_USERNAME,
        })
      }

      const existing = await prisma.profile.findUnique({
        where:  { username: username.toLowerCase() },
        select: { id: true },
      })

      return reply.send({
        success: true,
        data: { available: !existing },
      })
    }
  )
}
