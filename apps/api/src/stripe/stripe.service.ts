import { stripe }                        from './stripe.client'
import { prisma }                        from '@taplink/db'
import { invalidateProfileCacheByUserId } from '../lib/cache'

// Abonelik dönem bitişini güvenli oku.
// NOT: Yeni Stripe API sürümlerinde current_period_end Subscription'dan
// subscription item'a taşındı. İki konumu da destekle.
function getPeriodEnd(sub: any): Date | null {
  const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end
  return ts ? new Date(ts * 1000) : null
}

// ─────────────────────────────────────────
// CHECKOUT SESSION
// ─────────────────────────────────────────
export async function createCheckoutSession(
  userId:    string,
  priceId:   string,
  userEmail: string,
): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  let customerId = user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    userEmail,
      metadata: { userId },   // webhook'ta userId bulmak için
    })
    customerId = customer.id
    await prisma.user.update({
      where: { id: userId },
      data:  { stripeCustomerId: customerId },
    })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    // ⚠️ payment_method_types KASITLI YOK — Stripe müşterinin ülkesine göre
    // uygun yöntemleri (PromptPay, kart, banka transferi...) otomatik gösterir.
    line_items: [{ price: priceId, quantity: 1 }],
    mode:        'subscription',
    success_url: `${process.env.FRONTEND_URL}/dashboard?checkout=success`,
    cancel_url:  `${process.env.FRONTEND_URL}/pricing?checkout=cancelled`,
    // NOT: automatic_tax kapalı — açık olması Stripe'ta vergi ayarı (origin address)
    // gerektirir, taze test hesabında hata verir. Prod'da açılabilir.
    metadata: { userId },
  })

  if (!session.url) {
    throw new Error('Stripe checkout session URL oluşturulamadı')
  }
  return session.url
}

// ─────────────────────────────────────────
// CUSTOMER PORTAL
// ─────────────────────────────────────────
export async function createPortalSession(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  if (!user.stripeCustomerId) {
    throw new Error('Bu kullanıcının aktif Stripe aboneliği yok')
  }

  const session = await stripe.billingPortal.sessions.create({
    customer:   user.stripeCustomerId,
    return_url: `${process.env.FRONTEND_URL}/dashboard/settings`,
  })
  return session.url
}

// ─────────────────────────────────────────
// WEBHOOK İŞLE
// ─────────────────────────────────────────
export async function handleWebhookEvent(event: import('stripe').Stripe.Event): Promise<void> {
  switch (event.type) {

    // Ödeme tamamlandı
    case 'checkout.session.completed': {
      const session = event.data.object as import('stripe').Stripe.Checkout.Session
      if (session.mode !== 'subscription') break

      const userId         = session.metadata?.userId
      const subscriptionId = session.subscription as string
      if (!userId) {
        console.error('[Stripe] checkout.session.completed: metadata.userId eksik', session.id)
        break
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const periodEnd    = getPeriodEnd(subscription)

      await prisma.user.update({
        where: { id: userId },
        data: {
          plan:                 'PRO',
          stripeSubscriptionId: subscriptionId,
          planExpiresAt:        periodEnd,
        },
      })

      await invalidateProfileCacheByUserId(userId)
      console.log(`[Stripe] ${userId} → PRO (expires: ${periodEnd?.toISOString() ?? 'null'})`)
      break
    }

    // Abonelik güncellendi / silindi
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as import('stripe').Stripe.Subscription
      await syncSubscription(subscription)
      break
    }

    // Ödeme başarısız
    case 'invoice.payment_failed': {
      const invoice = event.data.object as import('stripe').Stripe.Invoice
      console.warn(`[Stripe] Ödeme başarısız — customerId: ${invoice.customer}`)
      break
    }

    default:
      console.log(`[Stripe] İşlenmeyen event: ${event.type}`)
  }
}

// ─────────────────────────────────────────
// Abonelik durumunu DB ile senkronize et
// ─────────────────────────────────────────
async function syncSubscription(subscription: import('stripe').Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string

  const user = await prisma.user.findFirst({
    where:  { stripeCustomerId: customerId },
    select: { id: true },
  })
  if (!user) {
    console.error(`[Stripe] syncSubscription: customerId bulunamadı — ${customerId}`)
    return
  }

  const isActive  = subscription.status === 'active' || subscription.status === 'trialing'
  const periodEnd = getPeriodEnd(subscription)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan:          isActive ? 'PRO' : 'FREE',
      planExpiresAt: isActive ? periodEnd : null,
    },
  })

  await invalidateProfileCacheByUserId(user.id)
  console.log(`[Stripe] ${user.id} sync → ${isActive ? 'PRO' : 'FREE'} (status: ${subscription.status})`)
}
