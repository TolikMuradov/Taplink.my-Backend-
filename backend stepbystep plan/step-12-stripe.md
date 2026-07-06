# Step 12 — Stripe: Abonelik ve Plan Yönetimi

**Bağımlılık:** Step 01–11 tamamlanmış olmalı. Özellikle Step 05 (`requirePlan()` utility), Step 02 (veritabanı şeması).  
**Sonraki Step:** Tüm backend step'leri tamamlandı → Frontend başlar.

> ⚠️ **Webhook imzası doğrulaması zorunlu.** Stripe'tan gelen her webhook'u imzasız kabul etmek, herhangi birinin sana "kullanıcı PRO'ya geçti" mesajı göndermesine izin verir. Webhook secret'ı ASLA atlatma.

---

## Amaç

Kullanıcılar Taplink.my'yi ücretli planla kullanabilmeli. Bu step bittiğinde:

- Checkout sayfası açılıyor (Stripe Hosted Checkout)
- Ödeme tamamlandığında veritabanında plan güncelleniyor
- Abonelik iptal edildiğinde plan FREE'ye düşüyor
- Kullanıcı mevcut plan durumunu görebiliyor
- Customer Portal ile kendi aboneliğini yönetebiliyor (iptal, kart değiştirme)

---

## Neden Bu Kararlar?

### Neden Stripe Hosted Checkout, kendi form değil?

Kart bilgisi doğrudan frontend'e gelmez → PCI DSS uyumluluğu Stripe'ın sorumluluğuna geçer. Kendi checkout formu yazmak:
- PCI DSS Level 1 uyumluluğu gerektirir (çok maliyetli)
- Güvenlik açığı riski
- Her ülkedeki ödeme yöntemi entegrasyonu (GoPay, TrueMoney, GCash vb.) ayrı iş

Stripe Hosted Checkout'ta: Stripe otomatik olarak kullanıcının ülkesine göre ödeme yöntemlerini gösterir. SEA (Güneydoğu Asya) için kritik.

### Neden Customer Portal?

Kullanıcı aboneliğini iptal etmek veya kartını güncellemek istediğinde backend'de hiçbir şey yazmana gerek yok — Stripe'ın kendi arayüzü bu işlemleri halleder ve webhook gönderir. Sen sadece webhook'a göre veritabanını güncellersin.

### Neden veritabanında hem `stripeCustomerId` hem `stripeSubscriptionId` saklıyoruz?

- `stripeCustomerId`: Bir kullanıcı birden fazla kez abone olabilir. Müşteri Stripe'ta tek bir entity — her yeni abonelik aynı müşteriye bağlanır.
- `stripeSubscriptionId`: Webhook event'lerinde hangi aboneliğin değiştiğini bulmak için. `customer.subscription.updated` geldiğinde `subscriptionId` ile User'ı buluyoruz.

### Neden webhook'ta `checkout.session.completed` ve `customer.subscription.*` ikisi de dinleniyor?

`checkout.session.completed`: Ödeme tamamlandı → `stripeCustomerId` ve `stripeSubscriptionId` kaydet.

`customer.subscription.updated`: Plan değişikliği, yenileme tarihi güncellendi → `planExpiresAt` güncelle.

`customer.subscription.deleted`: Abonelik iptal edildi → plan FREE'ye düşür.

Sadece `checkout.session.completed`'ı dinlemek yeterli değil — abonelik yenilenemezse veya iptal edilirse bunu bilmemiz gerekiyor.

### Neden `planExpiresAt` alanı?

Stripe aboneliği iptal edildiğinde anında değil, dönem sonunda sona erer. Kullanıcı Ocak'ta ödeme yaptıysa ve Şubat'ta iptal ettiyse, Şubat sonuna kadar PRO özelliklerini kullanmalı. `planExpiresAt` bu tarihi tutar. `requirePlan()` bu tarihe göre kontrol eder.

### Neden `price_` ID'leri environment variable'da?

Stripe'ın test ve production ortamlarında farklı price ID'leri var. `.env`'de saklarsak kodu değiştirmeden ortam değiştirebilirsin. Ayrıca gelecekte aylık/yıllık fiyat ayrımı yapılacaksa sadece `.env`'e yeni değer eklenir.

### SEA Pazarı: `payment_method_types: ['card']` neden tehlikeli?

Tayland, Endonezya ve Filipinler'de KOBİ'lerin ve genç kullanıcıların kredi kartı sahiplik oranı **%5-10 civarındadır**. "Sadece kredi kartı" demek bu pazarda potansiyel müşterilerin %90'ını kaybetmek demektir.

Stripe bu ödeme yöntemlerini destekliyor — tek yapman gereken Stripe Dashboard'dan aktif etmek ve `payment_method_types` alanını **kaldırmak** (Stripe müşterinin ülkesine göre uygun yöntemleri otomatik sunar):

| Ülke | Kritik Yöntem |
|---|---|
| Tayland | PromptPay (zorunlu), TrueMoney |
| Endonezya | GoPay, OVO, DANA, bank transfer |
| Filipinler | GCash, Maya |
| Evrensel | Kredi/banka kartı |

**Stripe yeterli olmazsa:** Xendit ve 2C2P tüm SEA ülkelerini tek entegrasyonla karşılar. Stripe Tayland'da PromptPay destekliyor ama Endonezya lokal e-cüzdanları için Stripe desteği kısıtlı — Xendit bu durumda açık ara daha iyi seçim.

---

## Gereksinimler

- Stripe hesabı oluşturulmuş
- Stripe dashboard'da Product + Price oluşturulmuş (aylık PRO)
- Webhook endpoint Stripe dashboard'a eklenmiş

---

## Environment Variables

`.env` dosyasına ekle:

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...   # İleride yıllık plan eklenirse

# Frontend URL (Checkout success/cancel redirect için)
FRONTEND_URL=http://localhost:3000
```

---

## Veritabanı Notu

Step 02 şemasına bakıldığında Stripe alanları (`stripeCustomerId`, `stripeSubscriptionId`, `planExpiresAt`) **zaten `User` modeline eklenmiş durumda**. Step 02'de migration çalıştırıldığında bu alanlar da oluşturulur.

Eğer Step 02 migration'ı Stripe alanları eklenmeden önce çalıştırıldıysa ek migration gerekir:
```bash
pnpm --filter @taplink/db db:migrate
# Migration adı: add_stripe_fields_to_user
```

---

## Klasör Yapısı (Hedef)

```
apps/api/src/stripe/
├── stripe.client.ts       ← Stripe SDK instance
├── stripe.service.ts      ← createCheckoutSession, createPortalSession, handleWebhook
└── stripe.routes.ts       ← POST /api/stripe/checkout, /portal, /webhook
```

---

## TODO

### Bölüm 12.1 — Bağımlılığı Kur

- [ ] Paketi yükle:
  ```bash
  pnpm --filter @taplink/api add stripe
  ```

### Bölüm 12.2 — Stripe Client

- [ ] `apps/api/src/stripe/stripe.client.ts` oluştur:
  ```typescript
  import Stripe from 'stripe'

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable eksik')
  }

  export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',  // Daima sabit versiyon — otomatik güncelleme istemiyoruz
    typescript: true,
  })
  ```

### Bölüm 12.3 — Stripe Service

- [ ] `apps/api/src/stripe/stripe.service.ts` oluştur:
  ```typescript
  import { stripe }                  from './stripe.client'
  import { prisma }                  from '@taplink/db'
  import { invalidateProfileCache }  from '../lib/cache'  // Step 09'da src/lib/cache.ts olarak tanımlandı

  // ─────────────────────────────────────────
  // CHECKOUT SESSION OLUŞTUR
  // Kullanıcı bu URL'e yönlendirilir → Stripe ödeme sayfası açılır
  // ─────────────────────────────────────────
  export async function createCheckoutSession(
    userId:   string,
    priceId:  string,
    userEmail: string,
  ): Promise<string> {
    // Kullanıcının Stripe'ta müşteri kaydı var mı?
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

    let customerId = user.stripeCustomerId

    if (!customerId) {
      // İlk kez abone oluyorsa müşteri oluştur
      const customer = await stripe.customers.create({
        email:    userEmail,
        metadata: { userId },  // Webhook'ta userId bulmak için
      })
      customerId = customer.id

      await prisma.user.update({
        where: { id: userId },
        data:  { stripeCustomerId: customerId },
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      // ⚠️ payment_method_types KASITLI OLARAK YOK.
      // Stripe müşterinin IP'sine ve ülkesine göre uygun ödeme yöntemlerini
      // otomatik seçer: PromptPay (TH), kredi kartı, banka transferi vb.
      // 'card' yazarsan SEA'daki kullanıcıların %90'ını kaybedersin.
      // Stripe Dashboard → Settings → Payment Methods'tan ülke bazlı yöntemleri aktif et.
      line_items: [{
        price:    priceId,
        quantity: 1,
      }],
      mode:        'subscription',
      success_url: `${process.env.FRONTEND_URL}/dashboard?checkout=success`,
      cancel_url:  `${process.env.FRONTEND_URL}/pricing?checkout=cancelled`,
      // Fatura vergileri için müşteri ülkesini otomatik algıla
      automatic_tax: { enabled: true },
      // Metadata: webhook'ta hangi kullanıcı olduğunu bulmak için
      metadata: { userId },
    })

    if (!session.url) {
      throw new Error('Stripe checkout session URL oluşturulamadı')
    }

    return session.url
  }

  // ─────────────────────────────────────────
  // CUSTOMER PORTAL SESSION OLUŞTUR
  // Kullanıcı aboneliğini iptal etmek veya kartını değiştirmek istediğinde
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
  // Stripe'tan gelen event'leri veritabanına yansıt
  // ─────────────────────────────────────────
  export async function handleWebhookEvent(event: import('stripe').Stripe.Event): Promise<void> {
    switch (event.type) {

      // Ödeme başarıyla tamamlandı
      case 'checkout.session.completed': {
        const session = event.data.object as import('stripe').Stripe.Checkout.Session

        if (session.mode !== 'subscription') break  // Tek seferlik ödeme değil

        const userId         = session.metadata?.userId
        const subscriptionId = session.subscription as string

        if (!userId) {
          console.error('[Stripe] checkout.session.completed: metadata.userId eksik', session.id)
          break
        }

        // Abonelik detaylarını al — dönem bitiş tarihi için
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const periodEnd    = new Date(subscription.current_period_end * 1000)

        const user = await prisma.user.update({
          where: { id: userId },
          data: {
            plan:                  'PRO',
            stripeSubscriptionId:  subscriptionId,
            planExpiresAt:         periodEnd,
          },
          select: { username: true },
        })

        if (user.username) {
          await invalidateProfileCache(user.username)
        }

        console.log(`[Stripe] ${userId} → PRO (expires: ${periodEnd.toISOString()})`)
        break
      }

      // Abonelik güncellendi (yenileme, plan değişikliği, durum değişikliği)
      case 'customer.subscription.updated': {
        const subscription = event.data.object as import('stripe').Stripe.Subscription
        await syncSubscription(subscription)
        break
      }

      // Abonelik silindi (iptal dönem sonu tamamlandı)
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as import('stripe').Stripe.Subscription
        await syncSubscription(subscription)
        break
      }

      // Ödeme başarısız (kart doldu, geçersiz, vb.)
      case 'invoice.payment_failed': {
        const invoice = event.data.object as import('stripe').Stripe.Invoice
        const customerId = invoice.customer as string

        const user = await prisma.user.findFirst({
          where:  { stripeCustomerId: customerId },
          select: { id: true },
        })

        if (user) {
          // Burada ileride e-posta bildirimi eklenebilir
          // Şimdilik sadece logluyoruz — Stripe otomatik retry yapar
          console.warn(`[Stripe] Ödeme başarısız — customerId: ${customerId}`)
        }
        break
      }

      default:
        // Dinlemediğimiz event'ler için sessizce geç
        console.log(`[Stripe] İşlenmeyen event: ${event.type}`)
    }
  }

  // ─────────────────────────────────────────
  // YARDIMCI: Abonelik durumunu veritabanıyla senkronize et
  // ─────────────────────────────────────────
  async function syncSubscription(subscription: import('stripe').Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string

    const user = await prisma.user.findFirst({
      where:  { stripeCustomerId: customerId },
      select: { id: true, username: true },
    })

    if (!user) {
      console.error(`[Stripe] syncSubscription: customerId bulunamadı — ${customerId}`)
      return
    }

    const isActive    = subscription.status === 'active' || subscription.status === 'trialing'
    const periodEnd   = new Date(subscription.current_period_end * 1000)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        plan:          isActive ? 'PRO' : 'FREE',
        planExpiresAt: isActive ? periodEnd : null,
        // İptal edildiyse subscriptionId'yi temizleme —
        // kullanıcı gelecekte tekrar abone olabilir, aynı customerId kullanırız
      },
    })

    if (user.username) {
      await invalidateProfileCache(user.username)
    }

    console.log(`[Stripe] ${user.id} sync → ${isActive ? 'PRO' : 'FREE'} (status: ${subscription.status})`)
  }
  ```

### Bölüm 12.4 — Stripe Routes

- [ ] `apps/api/src/stripe/stripe.routes.ts` oluştur:
  ```typescript
  import { FastifyInstance }      from 'fastify'
  import { requireAuth }          from '../lib/auth'
  import { stripe }               from './stripe.client'
  import {
    createCheckoutSession,
    createPortalSession,
    handleWebhookEvent,
  } from './stripe.service'

  export async function stripeRoutes(fastify: FastifyInstance) {

    // ─────────────────────────────────────
    // POST /api/stripe/checkout
    // Ödeme sayfası URL'i oluştur ve döndür
    // Frontend bu URL'e kullanıcıyı yönlendirir
    // ─────────────────────────────────────
    fastify.post('/api/stripe/checkout', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const { priceId } = req.body as { priceId?: string }

      // Desteklenen price ID'leri kontrol et
      const validPriceIds = [
        process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
        process.env.STRIPE_PRO_YEARLY_PRICE_ID,
      ].filter(Boolean)

      if (!priceId || !validPriceIds.includes(priceId)) {
        return reply.status(400).send({
          success: false,
          message: 'Geçersiz plan ID',
        })
      }

      // Zaten PRO ise checkout'a yönlendirme — portal'a yönlendir
      if (req.user!.plan === 'PRO') {
        return reply.status(400).send({
          success: false,
          code:    'ALREADY_PRO',
          message: 'Zaten aktif PRO aboneliğiniz var. Yönetmek için portal kullanın.',
        })
      }

      const checkoutUrl = await createCheckoutSession(
        req.user!.id,
        priceId,
        req.user!.email,
      )

      return reply.send({ success: true, url: checkoutUrl })
    })

    // ─────────────────────────────────────
    // POST /api/stripe/portal
    // Müşteri portal URL'i oluştur
    // Kullanıcı iptal etmek veya kart güncellemek istediğinde
    // ─────────────────────────────────────
    fastify.post('/api/stripe/portal', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      if (req.user!.plan !== 'PRO') {
        return reply.status(400).send({
          success: false,
          message: 'Aktif abonelik yok',
        })
      }

      const portalUrl = await createPortalSession(req.user!.id)

      return reply.send({ success: true, url: portalUrl })
    })

    // ─────────────────────────────────────
    // GET /api/stripe/status
    // Kullanıcının mevcut plan durumu
    // Frontend dashboard'da göstermek için
    // ─────────────────────────────────────
    fastify.get('/api/stripe/status', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const { plan, planExpiresAt, stripeSubscriptionId } = req.user!

      let subscriptionStatus: string | null = null

      // Aktif abonelik varsa Stripe'tan güncel durumu al
      // (dashboard açılışında bir kez kontrol — her endpoint'te değil)
      if (stripeSubscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
          subscriptionStatus = sub.status
        } catch (err) {
          // Abonelik silinmişse hata vermez, sadece null döner
          console.warn('[Stripe] Abonelik durumu alınamadı:', err)
        }
      }

      return reply.send({
        success: true,
        data: {
          plan,
          planExpiresAt,
          subscriptionStatus,  // active | trialing | past_due | canceled | ...
          hasActiveSubscription: !!stripeSubscriptionId,
        },
      })
    })

    // ─────────────────────────────────────
    // POST /api/stripe/webhook
    // Stripe'tan gelen event'leri işle
    //
    // ÖNEMLİ: Bu endpoint auth gerektirmez — Stripe çağırır.
    // Güvenlik: imza doğrulaması aşağıda yapılıyor.
    // Rate limit: public grubunda (Step 11), ancak Stripe'ın IP'leri
    // whitelist'e alınabilir (bu step kapsamı dışı).
    //
    // ÖNEMLİ: raw body gerekiyor — JSON.parse() EDİLMEMİŞ ham veri.
    // Fastify'ın JSON parser'ı devreye girmeden önce alınmalı.
    // ─────────────────────────────────────
    fastify.post('/api/stripe/webhook', {
      config: { rawBody: true },  // @fastify/rawbody gerektirir — aşağıya bak
    }, async (req, reply) => {
      const signature = req.headers['stripe-signature']

      if (!signature) {
        return reply.status(400).send({ error: 'stripe-signature header eksik' })
      }

      let event: import('stripe').Stripe.Event

      try {
        // constructEventAsync: async imza doğrulama
        // rawBody: @fastify/rawbody plugin'i tarafından eklenir
        event = await stripe.webhooks.constructEventAsync(
          (req as any).rawBody,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET!,
        )
      } catch (err) {
        console.error('[Stripe] Webhook imza doğrulama hatası:', err)
        return reply.status(400).send({ error: 'Geçersiz webhook imzası' })
      }

      // Event'i işle — hata fırlatırsa Stripe 5xx alır ve retry eder
      await handleWebhookEvent(event)

      // Stripe 200 almadan retry eder — her zaman 200 dön
      return reply.status(200).send({ received: true })
    })
  }
  ```

### Bölüm 12.5 — Raw Body Plugin

Stripe webhook imza doğrulaması için Fastify'ın JSON parse etmeden önceki ham body'yi görmesi gerekiyor.

- [ ] Paketi yükle:
  ```bash
  pnpm --filter @taplink/api add @fastify/rawbody
  ```

- [ ] `apps/api/src/app.ts` içinde **diğer plugin'lerden önce** register et:
  ```typescript
  import rawBody from '@fastify/rawbody'

  // JSON parser'dan ÖNCE — sıra önemli
  await app.register(rawBody, {
    field:    'rawBody',  // req.rawBody olarak erişilir
    global:   false,      // Tüm route'larda değil, sadece { config: { rawBody: true } } olanlarda
    encoding: 'utf8',
    runFirst: true,
  })
  ```

### Bölüm 12.6 — Route'u Uygulamaya Bağla

- [ ] `apps/api/src/app.ts` içine ekle:
  ```typescript
  import { stripeRoutes } from './stripe/stripe.routes'

  await app.register(stripeRoutes)
  ```

### Bölüm 12.7 — `requirePlan()` Güncellemesi

Step 05'te yazılan `requirePlan()` utility'si plan kontrolü yapıyor ama `planExpiresAt` kontrolü yoktu. İptal edilmiş ama süresi henüz dolmamış abonelikler doğru çalışsın diye güncelle.

- [ ] `apps/api/src/utils/plan.ts` (Step 05'te bu yolda oluşturuldu) içinde güncelle:
  ```typescript
  import { prisma }         from '@taplink/db'
  import { FastifyReply }   from 'fastify'

  export async function requirePlan(
    userId:       string,
    requiredPlan: 'PRO',
    reply:        FastifyReply,
  ): Promise<boolean> {
    const user = await prisma.user.findUniqueOrThrow({
      where:  { id: userId },
      select: { plan: true, planExpiresAt: true },
    })

    // PRO plan aktif mi?
    // Koşul: plan === 'PRO' VE (planExpiresAt yoksa veya henüz geçmediyse)
    const isPro =
      user.plan === 'PRO' &&
      (user.planExpiresAt === null || user.planExpiresAt > new Date())

    if (!isPro) {
      reply.status(403).send({
        success: false,
        code:    'PRO_REQUIRED',
        message: 'Bu özellik PRO plan gerektirir.',
      })
      return false  // engellendi
    }

    return true  // devam et
  }
  ```

### Bölüm 12.8 — Stripe Dashboard Ayarları

Bu adımlar kod değil, Stripe dashboard'da yapılacak:

- [ ] **Product oluştur:** Stripe Dashboard → Products → "Taplink.my PRO"
- [ ] **Price oluştur (aylık):** $9.99/month (veya hedef pazara göre THB/IDR/PHP)
- [ ] **Price ID'yi kopyala:** `price_xxx` → `.env` içine `STRIPE_PRO_MONTHLY_PRICE_ID` olarak ekle
- [ ] **Webhook endpoint ekle:** Dashboard → Developers → Webhooks → Add endpoint
  - URL: `https://api.taplink.my/api/stripe/webhook`
  - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] **Webhook secret kopyala:** `whsec_xxx` → `.env` içine `STRIPE_WEBHOOK_SECRET` olarak ekle
- [ ] **Customer Portal'ı aktif et:** Dashboard → Settings → Billing → Customer Portal → Enable

### Bölüm 12.9 — Lokal Webhook Testi (Stripe CLI)

Stripe'ın lokal test aracı production'a gerek kalmadan webhook'ları test etmenizi sağlar.

- [ ] Stripe CLI'yi indir: https://stripe.com/docs/stripe-cli
- [ ] Lokal tunnel başlat:
  ```bash
  stripe listen --forward-to localhost:3001/api/stripe/webhook
  ```
  Bu komut bir `whsec_xxx` key verir — bunu `.env.development` içine koy.
- [ ] Test event'i tetikle:
  ```bash
  # Başarılı ödeme simülasyonu
  stripe trigger checkout.session.completed

  # Abonelik iptali simülasyonu
  stripe trigger customer.subscription.deleted
  ```
- [ ] API loglarında `[Stripe] ... → PRO` mesajı çıkmalı
- [ ] Veritabanında kullanıcının `plan` alanı `PRO` olmalı

---

## Güvenlik Notları

- `STRIPE_SECRET_KEY` ve `STRIPE_WEBHOOK_SECRET` ASLA kod içinde, loglarda veya client'a gönderilen response'da görünmemeli.
- Webhook endpoint'ine imza doğrulaması olmadan işlem yapma. `constructEventAsync` hata fırlatırsa `400` dön — sessizce geçme.
- `priceId` frontend'den geldiğinde whitelist kontrolü şart (yukarıda yapıldı). Aksi halde kullanıcı istediği price_id'yi gönderebilir.
- `metadata.userId` webhook event'inde güvenilir — Stripe imzaladı. Doğrudan DB'ye güvenle yazılabilir.
- Test ortamında `sk_test_` key kullan. Production'a geçince `sk_live_` ile değiştir — kod değişmez, sadece `.env` değişir.
- `@fastify/rawbody` plugin'inde `global: false` — sadece webhook route'unda aktif. Diğer route'larda gereksiz overhead yok.

---

## Debug Notları

**`No signatures found matching the expected signature for payload` hatası**
→ Webhook secret yanlış veya `rawBody` düzgün alınmıyor.
→ `console.log((req as any).rawBody?.slice(0, 100))` ile raw body geldiğini doğrula.
→ `rawBody` plugin'inin `runFirst: true` ile register edildiğinden emin ol.

**Webhook event'i geliyor ama veritabanı güncellenmiyor**
→ `handleWebhookEvent` içindeki `switch` case'ini kontrol et.
→ Event type'ı tam olarak eşleşmeli: `checkout.session.completed` (nokta ile).
→ `metadata.userId` dolu mu? Stripe CLI test event'leri metadata içermez — gerçek checkout oturumu simüle edilmeli.

**`STRIPE_PRO_MONTHLY_PRICE_ID` undefined**
→ `.env` dosyası API uygulaması tarafından yüklenmiyor olabilir.
→ `console.log(process.env.STRIPE_PRO_MONTHLY_PRICE_ID)` ile kontrol et.
→ Turborepo'da her `apps/api/.env` dosyası `apps/api`'ye özel — root `.env` otomatik yüklenmiyor olabilir.

**Checkout session oluştururken `No such price` hatası**
→ Test modunda `price_test_xxx` ID kullanıyorsun ama live key ile bağlandın ya da tersi.
→ Stripe key ve price ID aynı ortamda (test/live) olmalı.

**Customer Portal `Configuration not found` hatası**
→ Stripe Dashboard → Settings → Billing → Customer Portal → aktif edilmemiş.
→ En az bir portal konfigürasyonu oluşturulmalı (otomatik oluşturuluyor, aktif etmek yeterli).

**`planExpiresAt` kontrolü çalışmıyor — iptal sonrası hala PRO**
→ `requirePlan()` güncellemesi (Bölüm 12.7) uygulandı mı?
→ `customer.subscription.deleted` webhook'u geldi mi? Stripe CLI ile `stripe trigger customer.subscription.deleted` test et.
→ Stripe'ta abonelik "cancel at period end" ile iptal edilirse `subscription.deleted` dönem sonunda gelir — hemen gelmez.

---

## Teslim Kriterleri

- [ ] `POST /api/stripe/checkout` ile geçerli `priceId` gönderilince Stripe checkout URL'i dönüyor
- [ ] Geçersiz `priceId` ile `400` hatası dönüyor
- [ ] PRO kullanıcı tekrar checkout yapmaya çalışınca `ALREADY_PRO` hatası dönüyor
- [ ] `POST /api/stripe/portal` PRO kullanıcı için portal URL'i dönüyor, FREE kullanıcı için `400` dönüyor
- [ ] `GET /api/stripe/status` plan ve `planExpiresAt` döndürüyor
- [ ] `checkout.session.completed` webhook'u gelince kullanıcının `plan` alanı `PRO` oluyor
- [ ] `customer.subscription.deleted` webhook'u gelince `plan` `FREE`'ye dönüyor
- [ ] Yanlış imza ile webhook gönderilince `400` hatası dönüyor
- [ ] `requirePlan()` `planExpiresAt` geçmiş kullanıcıyı `PRO` saymıyor
- [ ] Stripe CLI ile lokal webhook testi başarılı
- [ ] Test ortamında `sk_test_` key, production'da `sk_live_` key — kod değişikliği yok
