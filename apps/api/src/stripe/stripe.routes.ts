import { FastifyInstance } from 'fastify'
import { prisma }          from '@taplink/db'
import { requireAuth }     from '../modules/auth/auth.middleware'  // doküman '../lib/auth' yazıyordu — düzeltildi
import { stripe }          from './stripe.client'
import {
  createCheckoutSession,
  createPortalSession,
  handleWebhookEvent,
} from './stripe.service'

export async function stripeRoutes(fastify: FastifyInstance) {

  // ─────────────────────────────────────────
  // POST /api/stripe/checkout — ödeme sayfası URL'i
  // ─────────────────────────────────────────
  fastify.post('/api/stripe/checkout', { preHandler: [requireAuth] }, async (req, reply) => {
    const { priceId } = req.body as { priceId?: string }

    const validPriceIds = [
      process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      process.env.STRIPE_PRO_YEARLY_PRICE_ID,
    ].filter(Boolean)

    if (!priceId || !validPriceIds.includes(priceId)) {
      return reply.status(400).send({ success: false, code: 'VALIDATION_ERROR', message: 'Geçersiz plan ID' })
    }

    // plan + email DB'den (session'da plan yok)
    const dbUser = await prisma.user.findUnique({
      where:  { id: req.user!.id },
      select: { plan: true, email: true },
    })

    if (dbUser?.plan === 'PRO') {
      return reply.status(400).send({
        success: false, code: 'ALREADY_PRO',
        message: 'Zaten aktif PRO aboneliğiniz var. Yönetmek için portal kullanın.',
      })
    }

    const checkoutUrl = await createCheckoutSession(req.user!.id, priceId, dbUser!.email)
    return reply.send({ success: true, url: checkoutUrl })
  })

  // ─────────────────────────────────────────
  // POST /api/stripe/portal — müşteri portal URL'i
  // ─────────────────────────────────────────
  fastify.post('/api/stripe/portal', { preHandler: [requireAuth] }, async (req, reply) => {
    const dbUser = await prisma.user.findUnique({
      where:  { id: req.user!.id },
      select: { plan: true },
    })

    if (dbUser?.plan !== 'PRO') {
      return reply.status(400).send({ success: false, message: 'Aktif abonelik yok' })
    }

    const portalUrl = await createPortalSession(req.user!.id)
    return reply.send({ success: true, url: portalUrl })
  })

  // ─────────────────────────────────────────
  // GET /api/stripe/status — mevcut plan durumu
  // ─────────────────────────────────────────
  fastify.get('/api/stripe/status', { preHandler: [requireAuth] }, async (req, reply) => {
    const dbUser = await prisma.user.findUnique({
      where:  { id: req.user!.id },
      select: { plan: true, planExpiresAt: true, stripeSubscriptionId: true },
    })

    let subscriptionStatus: string | null = null
    if (dbUser?.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(dbUser.stripeSubscriptionId)
        subscriptionStatus = sub.status
      } catch (err) {
        console.warn('[Stripe] Abonelik durumu alınamadı:', err)
      }
    }

    return reply.send({
      success: true,
      data: {
        plan:                  dbUser?.plan ?? 'FREE',
        planExpiresAt:         dbUser?.planExpiresAt ?? null,
        subscriptionStatus,
        hasActiveSubscription: !!dbUser?.stripeSubscriptionId,
      },
    })
  })

  // ─────────────────────────────────────────
  // POST /api/stripe/webhook — Stripe event'leri
  // Auth YOK (Stripe çağırır) — güvenlik: imza doğrulaması
  // rawBody gerekli (@fastify/rawbody, config.rawBody:true)
  // ─────────────────────────────────────────
  fastify.post('/api/stripe/webhook', { config: { rawBody: true } }, async (req, reply) => {
    const signature = req.headers['stripe-signature']
    if (!signature) {
      return reply.status(400).send({ error: 'stripe-signature header eksik' })
    }

    let event: import('stripe').Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        (req as any).rawBody,
        signature as string,
        process.env.STRIPE_WEBHOOK_SECRET!,
      )
    } catch (err) {
      console.error('[Stripe] Webhook imza doğrulama hatası:', err)
      return reply.status(400).send({ error: 'Geçersiz webhook imzası' })
    }

    await handleWebhookEvent(event)
    return reply.status(200).send({ received: true })
  })
}
