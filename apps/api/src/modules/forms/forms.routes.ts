import { FastifyInstance } from 'fastify'
import { prisma }         from '@taplink/db'
import { z }              from 'zod'
import { ErrorCodes }     from '@taplink/validations'
import { submitContactForm, submitEmailCapture } from './forms.service'

const emailSchema = z.string().email().max(200)

export async function formsRoutes(fastify: FastifyInstance) {

  // ─────────────────────────────────────────
  // POST /api/p/forms/contact/:linkId — ziyaretçi contact form (auth yok)
  // Rate limiting Step 11'de eklenecek
  // ─────────────────────────────────────────
  fastify.post('/api/p/forms/contact/:linkId', async (req, reply) => {
    const { linkId } = req.params as { linkId: string }

    const link = await prisma.link.findFirst({
      where:  { id: linkId, type: 'CONTACT_FORM', isActive: true },
      select: { profileId: true, metadata: true, profile: { select: { userId: true } } },
    })

    if (!link) {
      return reply.status(404).send({ success: false, code: ErrorCodes.LINK_NOT_FOUND })
    }

    const meta = link.metadata as any
    const body = req.body as any
    const requiredFields: string[] = meta?.fields ?? ['email', 'message']

    if (requiredFields.includes('email') && !body?.email) {
      return reply.status(400).send({ success: false, code: ErrorCodes.VALIDATION_ERROR })
    }
    if (requiredFields.includes('message') && !body?.message) {
      return reply.status(400).send({ success: false, code: ErrorCodes.VALIDATION_ERROR })
    }

    const emailParse = emailSchema.safeParse(body?.email)
    if (!emailParse.success) {
      return reply.status(400).send({ success: false, code: ErrorCodes.VALIDATION_ERROR })
    }

    const { error } = await submitContactForm(
      link.profileId,
      linkId,
      link.profile.userId,
      {
        email:   emailParse.data,
        name:    body?.name    ? String(body.name).slice(0, 100)    : undefined,
        phone:   body?.phone   ? String(body.phone).slice(0, 30)    : undefined,
        message: body?.message ? String(body.message).slice(0, 2000) : undefined,
      }
    )

    if (error) {
      return reply.status(500).send({ success: false, code: error })
    }

    const successMessage = meta?.successMessage ?? 'Mesajınız iletildi!'
    return reply.send({ success: true, data: { message: successMessage } })
  })

  // ─────────────────────────────────────────
  // POST /api/p/forms/subscribe/:linkId — ziyaretçi email capture (auth yok)
  // ─────────────────────────────────────────
  fastify.post('/api/p/forms/subscribe/:linkId', async (req, reply) => {
    const { linkId } = req.params as { linkId: string }

    const link = await prisma.link.findFirst({
      where:  { id: linkId, type: 'EMAIL_CAPTURE', isActive: true },
      select: { profileId: true, metadata: true, profile: { select: { userId: true } } },
    })

    if (!link) {
      return reply.status(404).send({ success: false, code: ErrorCodes.LINK_NOT_FOUND })
    }

    const body       = req.body as any
    const meta       = link.metadata as any
    const emailParse = emailSchema.safeParse(body?.email)

    if (!emailParse.success) {
      return reply.status(400).send({ success: false, code: ErrorCodes.VALIDATION_ERROR })
    }

    const { error, alreadySubscribed } = await submitEmailCapture(
      link.profileId,
      linkId,
      link.profile.userId,
      {
        email: emailParse.data,
        name:  body?.name ? String(body.name).slice(0, 100) : undefined,
      }
    )

    if (error) {
      return reply.status(500).send({ success: false, code: error })
    }

    const successMessage = alreadySubscribed
      ? 'Zaten abonesiniz!'
      : (meta?.successMessage ?? 'Abone oldunuz!')

    return reply.send({ success: true, data: { message: successMessage, alreadySubscribed } })
  })
}
