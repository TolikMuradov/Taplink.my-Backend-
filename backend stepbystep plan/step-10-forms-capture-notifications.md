# Step 10 — Forms, Capture & Notifications

**Bağımlılık:** Step 01–09 tamamlanmış olmalı.  
**Sonraki Step:** Step 11 (Rate Limiting), Step 12 (Stripe).

---

## Amaç

Ziyaretçilerin CONTACT_FORM ve EMAIL_CAPTURE bloklarıyla etkileşimini, profil sahiplerinin bildirim sistemini kurmak. Bu step bittiğinde:

- Ziyaretçi contact form doldurunca Lead tablosuna kaydedilir, profil sahibine bildirim oluşturulur
- Ziyaretçi email capture formuna abone olunca Subscriber tablosuna kaydedilir, bildirim oluşturulur
- Profil sahibi dashboard'da bildirimlerini görür, okundu işaretler
- Profil sahibi gelen lead'leri ve abone listesini sorgular, CSV export eder
- Opsiyonel email bildirimi: profil sahibi isterse Mailjet ile email de alır

---

## Neden Bu Kararlar?

### In-app notification neden email'e tercih edildi?

Email bildirimi güvenilir ama her şeyi email olarak göndermek kullanıcıyı bunaltır. Davranış şöyle:

```
Ziyaretçi form doldurur
  → Notification tablosuna yaz (her zaman)
  → Profil sahibi email bildirimi açmışsa Mailjet ile gönder (opsiyonel)
```

Kullanıcı dashboard'a girince sol üstte "🔔 3" görür. Email tercihini profile settings'ten kapatabilir. Bu yaklaşım hem gerçek zamanlı hem de spam yaratmayan bir denge.

### Neden polling, WebSocket değil?

Dashboard açıkken frontend her 30 saniyede `GET /api/notifications/count` atar — 1 byte'lık cevap. WebSocket bağlantısı her kullanıcı için sunucuda açık tutulan bir kaynak demektir. Şu an için polling yeterli; ölçek büyüdüğünde SSE'ye geçiş için service katmanı aynı kalır.

### Subscriber tablosunda neden `@@unique([profileId, email])`?

Aynı ziyaretçi aynı profil için iki kez abone olmaya çalışırsa Prisma unique constraint ile bunu engeller — kod tarafında kontrol gerektirmez. Hata olarak değil "zaten abonesin" mesajıyla karşılanır.

### Lead ve Subscriber neden ayrı tablolar?

- `Lead` → bir mesaj, tek seferlik iletişim. İçerik önemli (mesaj metni, telefon).
- `Subscriber` → süregelen ilişki. Email adresi ve tarih yeterli.

Aynı tabloya koymak veri modelini kirletir ve sorguları zorlaştırır.

### CONTACT_DETAILS ve SOCIAL_PROOF neden backend'de özel işlem yok?

Bu iki block sadece görsel veri gösterir. CONTACT_DETAILS'teki telefon/email/LINE bilgileri metadata'da saklanır — tıklanınca frontend `tel:`, `mailto:`, `https://wa.me/` protokollerini açar. Sunucuda hiçbir şey olmaz. SOCIAL_PROOF'taki rakamlar da statik — elle girilir, backend sadece saklar. Bu step'te bu iki block için endpoint yazılmaz.

### CSV export neden backend'de?

Frontend'de büyük veri seti dönüştürmek yavaş ve bellek tüketir. Backend tek sorguyla tüm listeyi çeker, CSV'ye çevirir, stream olarak gönderir. Binlerce abone olsa bile bu çalışır.

---

## Gereksinimler

- Step 02 tamamlanmış (`Lead`, `Subscriber`, `Notification` modelleri Prisma şemasında)
- Step 04 tamamlanmış (`requireAuth` middleware)
- Step 05 tamamlanmış (profil sahibinin userId'si session'dan alınabiliyor)
- Step 09 tamamlanmış (public profil context — `profileId` bilinebilir)
- Mailjet entegrasyonu Step 04'te kuruldu — email bildirimi için tekrar kullanılacak

---

## Klasör Yapısı (Hedef)

```
apps/api/src/modules/forms/
├── forms.service.ts       ← Lead kaydetme, subscriber kaydetme, notification oluşturma
├── forms.routes.ts        ← Ziyaretçi form endpoint'leri (auth yok)

apps/api/src/modules/notifications/
├── notifications.service.ts  ← Notification CRUD
└── notifications.routes.ts   ← Dashboard bildirim endpoint'leri (auth var)

apps/api/src/modules/leads/
├── leads.service.ts       ← Lead + subscriber listeleme, CSV export
└── leads.routes.ts        ← Dashboard lead/subscriber endpoint'leri (auth var)
```

---

## TODO

### Bölüm 10.1 — Forms Service (Ziyaretçi Tarafı)

- [ ] `apps/api/src/modules/forms/forms.service.ts` oluştur:
  ```typescript
  import { prisma }        from '@taplink/db'
  import { ErrorCodes }    from '@taplink/validations'
  import { sendEmail }     from '../auth/auth.email'  // Step 04'teki Mailjet helper
  import {
    ContactFormMetaSchema,
    EmailCaptureMetaSchema,
  } from '@taplink/validations'

  // ─────────────────────────────────────────
  // CONTACT FORM — Lead kaydı
  // ─────────────────────────────────────────

  type ContactFormInput = {
    name?:    string
    email:    string
    phone?:   string
    message?: string
  }

  export async function submitContactForm(
    profileId: string,
    linkId:    string,
    userId:    string,   // profil sahibinin userId — bildirim için
    input:     ContactFormInput
  ): Promise<{ error: string | null }> {

    // Lead kaydet
    const lead = await prisma.lead.create({
      data: {
        profileId,
        linkId,
        name:    input.name ?? null,
        email:   input.email,
        phone:   input.phone ?? null,
        message: input.message ?? null,
      },
    })

    // In-app bildirim oluştur
    await prisma.notification.create({
      data: {
        userId,
        type:  'CONTACT_FORM',
        title: 'Yeni mesaj',
        body:  input.name
          ? `${input.name} size bir mesaj gönderdi`
          : 'Biri size mesaj gönderdi',
        data:  {
          leadId: lead.id,
          email:  input.email,
          name:   input.name,
        },
      },
    })

    // Opsiyonel email bildirimi — kullanıcı ayarından kontrol edilir
    // Şimdilik her zaman gönder (ayar sistemi Step 12 sonrası eklenebilir)
    // sendEmail() Step 04'teki Mailjet helper — hata olursa sessizce geç
    const profile = await prisma.profile.findUnique({
      where:  { id: profileId },
      select: { user: { select: { email: true, preferredLanguage: true } } },
    })

    if (profile?.user?.email) {
      sendEmail({
        to:       profile.user.email,
        template: 'contact_form_notification',
        lang:     profile.user.preferredLanguage ?? 'en',
        vars: {
          senderName:  input.name ?? 'Anonim',
          senderEmail: input.email,
          message:     input.message ?? '(mesaj yok)',
        },
      }).catch(() => {})  // email hatası formu engellemez
    }

    return { error: null }
  }

  // ─────────────────────────────────────────
  // EMAIL CAPTURE — Subscriber kaydı
  // ─────────────────────────────────────────

  type EmailCaptureInput = {
    email: string
    name?: string
  }

  export async function submitEmailCapture(
    profileId: string,
    linkId:    string,
    userId:    string,
    input:     EmailCaptureInput
  ): Promise<{ error: string | null; alreadySubscribed: boolean }> {

    // Aynı email bu profile zaten abone mi?
    try {
      await prisma.subscriber.create({
        data: {
          profileId,
          linkId,
          email: input.email.toLowerCase().trim(),
          name:  input.name ?? null,
        },
      })
    } catch (err: any) {
      // Unique constraint ihlali — zaten abone
      if (err?.code === 'P2002') {
        return { error: null, alreadySubscribed: true }
      }
      return { error: ErrorCodes.INTERNAL_ERROR, alreadySubscribed: false }
    }

    // In-app bildirim
    await prisma.notification.create({
      data: {
        userId,
        type:  'NEW_SUBSCRIBER',
        title: 'Yeni abone',
        body:  input.name
          ? `${input.name} (${input.email}) abone oldu`
          : `${input.email} abone oldu`,
        data:  { email: input.email, name: input.name },
      },
    })

    // Opsiyonel email bildirimi
    const profile = await prisma.profile.findUnique({
      where:  { id: profileId },
      select: { user: { select: { email: true, preferredLanguage: true } } },
    })

    if (profile?.user?.email) {
      sendEmail({
        to:       profile.user.email,
        template: 'new_subscriber_notification',
        lang:     profile.user.preferredLanguage ?? 'en',
        vars: {
          subscriberEmail: input.email,
          subscriberName:  input.name ?? '',
        },
      }).catch(() => {})
    }

    return { error: null, alreadySubscribed: false }
  }
  ```

### Bölüm 10.2 — Forms Routes (Ziyaretçi Tarafı — Auth Yok)

- [ ] `apps/api/src/modules/forms/forms.routes.ts` oluştur:
  ```typescript
  import { FastifyInstance } from 'fastify'
  import { prisma }         from '@taplink/db'
  import { z }              from 'zod'
  import { ErrorCodes }     from '@taplink/validations'
  import { submitContactForm, submitEmailCapture } from './forms.service'

  // Ortak validasyon yardımcıları
  const emailSchema = z.string().email().max(200)
  const nameSchema  = z.string().max(100).optional()

  export async function formsRoutes(fastify: FastifyInstance) {

    // ─────────────────────────────────────────
    // POST /api/p/forms/contact/:linkId
    // Ziyaretçi contact form gönderir
    // Auth yok
    // Rate limiting Step 11'de eklenecek
    // ─────────────────────────────────────────
    fastify.post('/api/p/forms/contact/:linkId', async (req, reply) => {
      const { linkId } = req.params as { linkId: string }

      // Linki bul — CONTACT_FORM tipinde olmalı, aktif olmalı
      const link = await prisma.link.findFirst({
        where: { id: linkId, type: 'CONTACT_FORM', isActive: true },
        select: {
          profileId: true,
          metadata:  true,
          profile: {
            select: { userId: true },
          },
        },
      })

      if (!link) {
        return reply.status(404).send({ success: false, code: ErrorCodes.LINK_NOT_FOUND })
      }

      // Metadata'dan hangi alanların zorunlu olduğunu al
      const meta  = link.metadata as any
      const body  = req.body as any

      // Dinamik validasyon — linkin ayarına göre
      const requiredFields: string[] = meta?.fields ?? ['email', 'message']

      if (requiredFields.includes('email') && !body?.email) {
        return reply.status(400).send({ success: false, code: ErrorCodes.VALIDATION_ERROR })
      }
      if (requiredFields.includes('message') && !body?.message) {
        return reply.status(400).send({ success: false, code: ErrorCodes.VALIDATION_ERROR })
      }

      // Email format kontrolü
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
          name:    body?.name   ? String(body.name).slice(0, 100)    : undefined,
          phone:   body?.phone  ? String(body.phone).slice(0, 30)    : undefined,
          message: body?.message ? String(body.message).slice(0, 2000) : undefined,
        }
      )

      if (error) {
        return reply.status(500).send({ success: false, code: error })
      }

      // Başarı mesajı — linkin ayarından al
      const successMessage = meta?.successMessage ?? 'Mesajınız iletildi!'
      return reply.send({ success: true, data: { message: successMessage } })
    })

    // ─────────────────────────────────────────
    // POST /api/p/forms/subscribe/:linkId
    // Ziyaretçi email capture formuna abone olur
    // Auth yok
    // ─────────────────────────────────────────
    fastify.post('/api/p/forms/subscribe/:linkId', async (req, reply) => {
      const { linkId } = req.params as { linkId: string }

      const link = await prisma.link.findFirst({
        where: { id: linkId, type: 'EMAIL_CAPTURE', isActive: true },
        select: {
          profileId: true,
          metadata:  true,
          profile: {
            select: { userId: true },
          },
        },
      })

      if (!link) {
        return reply.status(404).send({ success: false, code: ErrorCodes.LINK_NOT_FOUND })
      }

      const body      = req.body as any
      const meta      = link.metadata as any
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
  ```

### Bölüm 10.3 — Notifications Service & Routes (Dashboard)

- [ ] `apps/api/src/modules/notifications/notifications.service.ts` oluştur:
  ```typescript
  import { prisma } from '@taplink/db'

  // Okunmamış bildirim sayısı — dashboard badge için (polling ile çağrılır)
  export async function getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false },
    })
  }

  // Son bildirimleri listele
  export async function getNotifications(userId: string, page = 1, pageSize = 20) {
    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where:   { userId },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.notification.count({ where: { userId } }),
    ])

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    }
  }

  // Tekil bildirimi okundu yap
  export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data:  { isRead: true },
    })
    return result.count > 0
  }

  // Tümünü okundu yap
  export async function markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data:  { isRead: true },
    })
  }
  ```

- [ ] `apps/api/src/modules/notifications/notifications.routes.ts` oluştur:
  ```typescript
  import { FastifyInstance } from 'fastify'
  import { requireAuth }    from '../auth/auth.middleware'
  import {
    getUnreadCount, getNotifications,
    markAsRead, markAllAsRead,
  } from './notifications.service'

  export async function notificationsRoutes(fastify: FastifyInstance) {

    // GET /api/notifications/count — sadece sayı, polling için hafif
    fastify.get('/api/notifications/count', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const count = await getUnreadCount(req.user!.id)
      return reply.send({ success: true, data: { count } })
    })

    // GET /api/notifications?page=1 — liste
    fastify.get('/api/notifications', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const { page } = req.query as { page?: string }
      const data = await getNotifications(req.user!.id, Number(page ?? 1))
      return reply.send({ success: true, data })
    })

    // PATCH /api/notifications/:id/read — tekil okundu
    fastify.patch('/api/notifications/:id/read', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const { id } = req.params as { id: string }
      const ok = await markAsRead(id, req.user!.id)
      if (!ok) return reply.status(404).send({ success: false, code: 'NOT_FOUND' })
      return reply.send({ success: true })
    })

    // PATCH /api/notifications/read-all — hepsini okundu yap
    fastify.patch('/api/notifications/read-all', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      await markAllAsRead(req.user!.id)
      return reply.send({ success: true })
    })
  }
  ```

### Bölüm 10.4 — Leads & Subscribers (Dashboard)

- [ ] `apps/api/src/modules/leads/leads.service.ts` oluştur:
  ```typescript
  import { prisma } from '@taplink/db'

  // Lead listesi — profil sahibi kendi lead'lerini görür
  export async function getLeads(profileId: string, page = 1, pageSize = 50) {
    const [items, total] = await Promise.all([
      prisma.lead.findMany({
        where:   { profileId },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.lead.count({ where: { profileId } }),
    ])
    return { items, total, page, pageSize, hasMore: page * pageSize < total }
  }

  // Abone listesi
  export async function getSubscribers(profileId: string, page = 1, pageSize = 50) {
    const [items, total] = await Promise.all([
      prisma.subscriber.findMany({
        where:   { profileId },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      prisma.subscriber.count({ where: { profileId } }),
    ])
    return { items, total, page, pageSize, hasMore: page * pageSize < total }
  }

  // Abone listesi CSV — tümünü çek, string olarak döndür
  // Frontend download linki oluşturur: <a href="/api/leads/subscribers/export">İndir</a>
  export async function exportSubscribersCsv(profileId: string): Promise<string> {
    const subscribers = await prisma.subscriber.findMany({
      where:   { profileId },
      orderBy: { createdAt: 'asc' },
      select:  { email: true, name: true, createdAt: true },
    })

    const header = 'Email,Name,Subscribed At\n'
    const rows = subscribers.map(s =>
      `${s.email},${s.name ?? ''},${s.createdAt.toISOString()}`
    ).join('\n')

    return header + rows
  }

  // Lead CSV
  export async function exportLeadsCsv(profileId: string): Promise<string> {
    const leads = await prisma.lead.findMany({
      where:   { profileId },
      orderBy: { createdAt: 'asc' },
      select:  { name: true, email: true, phone: true, message: true, createdAt: true },
    })

    const header = 'Name,Email,Phone,Message,Date\n'
    const rows = leads.map(l => {
      // CSV injection koruması — virgül ve newline içeren değerleri tırnak içine al
      const msg = l.message ? `"${l.message.replace(/"/g, '""')}"` : ''
      return `${l.name ?? ''},${l.email},${l.phone ?? ''},${msg},${l.createdAt.toISOString()}`
    }).join('\n')

    return header + rows
  }
  ```

- [ ] `apps/api/src/modules/leads/leads.routes.ts` oluştur:
  ```typescript
  import { FastifyInstance } from 'fastify'
  import { requireAuth }    from '../auth/auth.middleware'
  import {
    getLeads, getSubscribers,
    exportSubscribersCsv, exportLeadsCsv,
  } from './leads.service'

  export async function leadsRoutes(fastify: FastifyInstance) {

    // GET /api/leads?page=1
    fastify.get('/api/leads', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const { page } = req.query as { page?: string }
      const data = await getLeads(req.user!.profileId, Number(page ?? 1))
      return reply.send({ success: true, data })
    })

    // GET /api/leads/export — CSV download
    fastify.get('/api/leads/export', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const csv = await exportLeadsCsv(req.user!.profileId)
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="leads.csv"')
      return reply.send(csv)
    })

    // GET /api/leads/subscribers?page=1
    fastify.get('/api/leads/subscribers', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const { page } = req.query as { page?: string }
      const data = await getSubscribers(req.user!.profileId, Number(page ?? 1))
      return reply.send({ success: true, data })
    })

    // GET /api/leads/subscribers/export — CSV download
    fastify.get('/api/leads/subscribers/export', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const csv = await exportSubscribersCsv(req.user!.profileId)
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="subscribers.csv"')
      return reply.send(csv)
    })
  }
  ```

### Bölüm 10.5 — Ana Uygulamaya Bağla

- [ ] `apps/api/src/app.ts` içine ekle:
  ```typescript
  import { formsRoutes }         from './modules/forms/forms.routes'
  import { notificationsRoutes } from './modules/notifications/notifications.routes'
  import { leadsRoutes }         from './modules/leads/leads.routes'

  app.register(formsRoutes)
  app.register(notificationsRoutes)
  app.register(leadsRoutes)
  ```

### Bölüm 10.6 — Migration

- [ ] Step 02'deki yeni modeller şemaya eklendi — migration çalıştır:
  ```bash
  pnpm --filter @taplink/db db:migrate
  # Migration adı: add_subscriber_notification
  ```

### Bölüm 10.7 — Mailjet Email Şablonları

Step 04'teki email sistemi bu step için iki yeni şablon gerektirir. Her şablon 6 dilde (EN/TH/ID/TL/VI/TR) yazılmalı.

- [ ] `contact_form_notification` şablonu — Mailjet'e ekle:
  ```
  Konu: Yeni mesaj — {{senderName}}
  İçerik:
    {{senderName}} ({{senderEmail}}) size mesaj gönderdi:
    
    "{{message}}"
    
    Taplink.my dashboard'undan görüntüleyebilirsiniz.
  ```

- [ ] `new_subscriber_notification` şablonu — Mailjet'e ekle:
  ```
  Konu: Yeni abone!
  İçerik:
    {{subscriberEmail}} email listenize abone oldu.
    
    Toplam abone listenizi dashboard'dan görüntüleyebilirsiniz.
  ```

---

## Debug Notları

**Contact form gönderildi ama Lead tablosunda yok**
→ `submitContactForm()` içindeki `prisma.lead.create()` hata fırlatıyor mu? `try/catch` ekleyip logla.
→ `linkId`'nin gerçekten `CONTACT_FORM` tipinde bir link'e ait olduğunu doğrula.
→ Route'ta `link` null geliyor olabilir — `isActive: true` kontrolü geçemiyor.

**"Zaten abonesiniz" her zaman dönüyor**
→ `@@unique([profileId, email])` constraint — email küçük harfe normalize edilmeli. `email.toLowerCase().trim()` yapıldığını doğrula.
→ Seed'de aynı email ile test abone oluşturulduysa unique ihlali çıkar.

**Bildirim oluşturuluyor ama sayaç `0` dönüyor**
→ `getUnreadCount()` doğru `userId` ile çağrılıyor mu? `req.user!.id` (userId) değil `req.user!.profileId` gönderilmiş olabilir.
→ `isRead: false` filtresini kontrol et — tüm bildirimler okundu olarak işaretlendi mi?

**Polling çok fazla istek atıyor**
→ Frontend'de 30 saniyeden daha kısa interval kurulmuş olabilir.
→ `GET /api/notifications/count` çok hafif (tek integer) ama yine de 10 saniyenin altına inme.
→ Dashboard kapatılınca interval temizlenmeli: `clearInterval()`.

**CSV export boş geliyor**
→ Profil ID kontrolü — `req.user!.profileId` doğru mu? `user.id` ile karıştırılmış olabilir.
→ `Content-Disposition` header'ı tarayıcıda doğru görünmüyor olabilir — dosya adını ASCII karakterlerle sınırlı tut.

**CSV'de virgül içeren mesajlar bozuluyor**
→ `exportLeadsCsv()`'deki tırnak içine alma mantığı çalışıyor mu?
→ `l.message.replace(/"/g, '""')` çift tırnak escape'i — Excel ve Numbers uyumlu.

**Email bildirimi gitmiyor**
→ `.catch(() => {})` ile hata sessizce geçiyor. Geçici olarak catch'i kaldır, hatayı logla.
→ Mailjet şablon adı (`contact_form_notification`) Mailjet panelindeki adla birebir eşleşmeli.
→ Step 04'teki `sendEmail()` helper'ın çalışır durumda olduğunu doğrula.

---

## Güvenlik Notları

- Form endpoint'leri auth gerektirmiyor — **Rate limiting şart.** Step 11'de tüm `/api/p/forms/*` endpoint'lerine IP bazlı rate limit eklenecek (örn. aynı IP'den 5 dakikada maksimum 3 form gönderimi).
- Email adresleri `toLowerCase().trim()` ile normalize edilir — büyük/küçük harf farklılığıyla çift kayıt önlenir.
- CSV export'ta SQL injection riski yok (Prisma parametric query). Ama CSV injection riski var — `=`, `+`, `-`, `@` ile başlayan değerler Excel'de formül olarak yorumlanabilir. Şimdilik mesaj alanı tırnak içine alınıyor; ileride daha kapsamlı sanitizasyon eklenebilir.
- Lead ve subscriber verileri sadece profil sahibi görebilir — `profileId` her sorguda WHERE koşulunda.
- Bildirimler `userId` ile kilitli — başka kullanıcının bildirimini okundu yapma denemesi `updateMany` count = 0 döndürür.
- Mailjet'e gönderilen veriler sanitize edilmeli — mesaj içeriği maximum 2000 karakter.

---

## Teslim Kriterleri

- [ ] `POST /api/p/forms/contact/:linkId` çalışıyor — Lead tablosuna kaydediliyor
- [ ] `POST /api/p/forms/subscribe/:linkId` çalışıyor — Subscriber tablosuna kaydediliyor
- [ ] Aynı email ile ikinci abone denemesi `alreadySubscribed: true` dönüyor, hata değil
- [ ] Her form gönderiminde Notification tablosuna kayıt oluşuyor
- [ ] `GET /api/notifications/count` okunmamış bildirim sayısını döndürüyor
- [ ] `GET /api/notifications` bildirimleri sayfalanmış döndürüyor
- [ ] `PATCH /api/notifications/:id/read` tekil bildirimi okundu yapıyor
- [ ] `PATCH /api/notifications/read-all` tüm bildirimleri okundu yapıyor
- [ ] Başka kullanıcının bildirimi okundu yapılamıyor (404)
- [ ] `GET /api/leads` lead listesini döndürüyor
- [ ] `GET /api/leads/export` geçerli CSV dosyası indiriyor
- [ ] `GET /api/leads/subscribers` abone listesini döndürüyor
- [ ] `GET /api/leads/subscribers/export` geçerli CSV dosyası indiriyor
- [ ] Email bildirimi gönderiliyor (Mailjet — opsiyonel, hata formu engellemez)
- [ ] `CONTACT_FORM` ve `EMAIL_CAPTURE` dışındaki link ID'leriyle istek gelince 404 dönüyor
