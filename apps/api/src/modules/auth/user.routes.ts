import { FastifyInstance } from 'fastify'
import { prisma } from '@taplink/db'
import { requireAuth } from './auth.middleware'
import { UsernameSchema } from '@taplink/validations'
import type { UserResponse } from '@taplink/types'

export async function userRoutes(fastify: FastifyInstance) {

  // Ben kimim? — Aktif kullanıcı bilgisi
  fastify.get(
    '/api/me',
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user!.id },
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          plan: true,
          createdAt: true,
          profile: {
            select: { username: true, avatarUrl: true },
          },
        },
      })

      if (!user) {
        return reply.status(404).send({ success: false, code: 'USER_NOT_FOUND' })
      }

      const response: UserResponse & { username: string | null } = {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        plan: user.plan,
        createdAt: user.createdAt.toISOString(),
        username: user.profile?.username ?? null,
      }

      return reply.send({ success: true, data: response })
    }
  )

  // Kullanıcı adı değiştir
  fastify.patch(
    '/api/me/username',
    { preHandler: requireAuth },
    async (request, reply) => {
      const result = UsernameSchema.safeParse((request.body as any)?.username)

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          code: 'INVALID_USERNAME',
          message: result.error.errors[0]?.message || 'Geçersiz kullanıcı adı',
        })
      }

      const username = result.data

      // Kullanıcı adı dolu mu kontrol et
      const existing = await prisma.profile.findUnique({
        where: { username },
      })

      if (existing && existing.userId !== request.user!.id) {
        return reply.status(409).send({
          success: false,
          code: 'USERNAME_TAKEN',
          message: 'Bu kullanıcı adı zaten alınmış',
        })
      }

      const updated = await prisma.profile.update({
        where: { userId: request.user!.id },
        data: { username },
        select: { username: true },
      })

      fastify.log.info(
        { userId: request.user!.id, username },
        '[USER] Kullanıcı adı güncellendi'
      )

      return reply.send({ success: true, data: updated })
    }
  )

  // Ad güncelle
  fastify.patch(
    '/api/me',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { name } = request.body as { name?: string }

      if (!name || name.trim().length < 2) {
        return reply.status(400).send({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'İsim en az 2 karakter olmalı',
        })
      }

      const updated = await prisma.user.update({
        where: { id: request.user!.id },
        data: { name: name.trim() },
        select: { id: true, name: true },
      })

      return reply.send({ success: true, data: updated })
    }
  )

  // Dil tercihini güncelle
  fastify.patch(
    '/api/me/language',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { language } = request.body as { language?: string }
      const supported = ['en', 'th', 'id', 'tl', 'vi', 'tr']

      if (!language || !supported.includes(language)) {
        return reply.status(400).send({
          success: false,
          code: 'VALIDATION_ERROR',
          message: `Desteklenen diller: ${supported.join(', ')}`,
        })
      }

      await prisma.user.update({
        where: { id: request.user!.id },
        data: { preferredLanguage: language },
      })

      return reply.send({ success: true, data: { preferredLanguage: language } })
    }
  )

  // Hesabı sil
  fastify.delete(
    '/api/me',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { confirm } = request.body as { confirm?: string }

      // Silme işlemini yanlışlıkla tetiklememek için onay gerekir
      if (confirm !== 'DELETE') {
        return reply.status(400).send({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Hesabı silmek için body\'de { "confirm": "DELETE" } gönder',
        })
      }

      await prisma.user.delete({
        where: { id: request.user!.id },
      })

      // Cascade: profile, link, click, subscriber otomatik silinir (Step 02)

      fastify.log.warn(
        { userId: request.user!.id },
        '[USER] Hesap silindi'
      )

      return reply.send({ success: true, data: { message: 'Hesabınız silindi' } })
    }
  )
}
