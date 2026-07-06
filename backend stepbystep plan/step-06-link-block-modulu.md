# Step 06 — Link & Block Modülü

**Bağımlılık:** Step 01–05 tamamlanmış olmalı.  
**Sonraki Step:** Step 07 (R2 dosya yükleme), Step 08 (Analytics), Step 09 (Public profil API) bu step'e bağımlıdır.

---

## Amaç

Kullanıcının profiline block (link, sosyal medya, başlık, görsel, harita, form vb.) ekleyip yönetmesini sağlamak. Bu step bittiğinde:

- Giriş yapmış kullanıcı block oluşturabilir, güncelleyebilir, silebilir, sıralayabilir
- Her block tipinin metadata'sı Zod ile doğrulanır
- PRO özellikleri (cardStyle, zamanlama, şifre, clickLimit) plan kontrolüne takılır
- COLLECTION block'u çocuk blokları yönetir (self-relation)
- Şifreli link girişi endpoint'i çalışır

**Bu step'te yapılmaz:** Dosya yükleme (Step 07), tıklama sayımı/analytics (Step 08), ziyaretçi görünümü (Step 09), contact form lead kaydı (Step 10).

---

## Neden Bu Kararlar?

### Block sistemi neden bu şekilde tasarlandı?

Linktree sadece düz buton sunar. Biz zengin card sistemi sunuyoruz — müzik kartı, ürün kartı, kitap kartı gibi. Bu farkı yaratan mimari şöyle çalışır:

```
Link modeli:
  type      → ne tür bir block? (LINK, SOCIAL, HEADER, EMBED, IMAGE...)
  cardStyle → LINK tipi için: nasıl görünsün? (basic, music, book, video, product)
  metadata  → o card stilinin ihtiyaç duyduğu veriler (JSON)
```

`type` ve `cardStyle` birbirinden bağımsız düşünülmeli:
- `type = LINK, cardStyle = music` → müzik butonu
- `type = EMBED` → YouTube/Spotify gömme (cardStyle yok)
- `type = HEADER` → sadece başlık yazısı (URL yok, cardStyle yok)

Yeni bir block tipi eklemek = enum'a değer ekle + metadata şeması yaz + frontend renderer yaz. Veritabanı şeması değişmez.

### `blockTheme` cascade sistemi

Profil sahibi `designSettings.blocks` içinde genel blok görünümünü (renk, şekil, stil) belirler. Bu CSS değişkeni olarak profile inject edilir ve tüm bloklar miras alır.

```
designSettings.blocks              ← Profil geneli varsayılan
  └── link.metadata.blockTheme     ← O bloğun override'ı (Partial<BlockDesign>)
```

Bir blok kendi `blockTheme` değeri yoksa profil genelindeki değer geçerli olur. Sadece farklı olması istenen alanlar override edilir — tam obje göndermek zorunda değil.

**Neden CSS değişkeni?** Profil sayfası ziyaretçi görüntülediğinde 10k-50k kullanıcı aynı anda gelebilir (Step 09'da ISR + Redis cache). Eğer her blok için ayrı veritabanı sorgusu veya hesaplama olsaydı bu yükü kaldırmak çok zor olurdu. CSS değişkenleri bir kere inject edilir, sonrasında tüm bloklar sıfır maliyetle devralır.

### Service katmanı neden route'dan ayrı?

- `link.routes.ts` → HTTP isteği alır, Zod ile doğrular, cevap döner
- `link.service.ts` → iş mantığını çalıştırır, veritabanıyla konuşur

Bu ayrım sayesinde:
1. Aynı iş mantığını farklı yerden çağırabilirsin (örn. Step 09 public profil API da blokları çekecek)
2. Test yazmak kolaylaşır — HTTP katmanına gerek kalmadan service test edilir
3. Hata ayıklamak kolaylaşır — sorun route'da mı service'te mi hemen belli olur

### Metadata neden `z.record(z.unknown())` olarak geliyor, service'te parse edilmiyor mu?

`CreateLinkSchema` ve `UpdateLinkSchema` içinde `metadata: z.record(z.unknown()).optional()` — yani tip kontrolü yapılmıyor. Bunun nedeni:

`type` ve `cardStyle` alanına göre hangi metadata şemasının uygulanacağı değişir. Zod discriminated union ile bunu çözebilirdik ama eklenecek her yeni block tipi için şemayı güncellememiz gerekirdi. Bunun yerine:

1. Route katmanı genel doğrulamayı yapar (zorunlu alanlar, tip enum)
2. Service katmanı `type + cardStyle` kombinasyonuna göre doğru Zod şemasını seçer ve `metadata`'yı o şemayla parse eder

Bu pattern "late binding validation" olarak bilinir — ne olduğu belli olunca doğru validator devreye girer.

### `position` alanı neden client'tan geliyor?

Drag & Drop sıralama için. Kullanıcı blokları yeniden sıralarken frontend tüm pozisyonları bir batch olarak gönderir (`ReorderLinksSchema`). Sunucu tek sorguda tümünü günceller. Alternatif (sunucu taraflı sıralama) daha karmaşık ve yavaş olur.

### COLLECTION self-relation

```prisma
model Link {
  parentId String?
  parent   Link?   @relation("CollectionItems", fields: [parentId], references: [id], onDelete: Cascade)
  children Link[]  @relation("CollectionItems")
}
```

`parentId` dolu olan blok bir koleksiyonun çocuğudur. Koleksiyon silinince çocuklar otomatik silinir (`onDelete: Cascade`). Çocuk blokların kendi koleksiyonu olamaz — servis katmanında kontrol edilir.

### PRO özellikleri neden şimdi kilitleniyor?

Ödeme sistemi (Step 12) henüz hazır değil ama kilitleri şimdi yazıyoruz çünkü:
- Sonradan eklemek = mevcut endpoint'leri değiştirmek = risk
- Şimdi `requirePlan` utility kullanmak = tek satır ekleme

Geliştirme ortamında test ederken `user.plan = 'PRO'` set edilebilir (Step 04'teki seed).

---

## Gereksinimler

- Step 04 tamamlanmış (`requireAuth` middleware hazır)
- Step 05 tamamlanmış (`requirePlan` utility `apps/api/src/utils/plan.ts`'te var)
- Step 03 tamamlanmış (tüm Zod şemaları: `CreateLinkSchema`, `UpdateLinkSchema`, `ReorderLinksSchema`, `UnlockLinkSchema`, tüm metadata şemaları)
- Step 02 tamamlanmış (Prisma şeması: `Link` modeli, `LinkType` enum, `Lead` modeli, `Click` modeli)

---

## Klasör Yapısı (Hedef)

```
apps/api/src/modules/link/
├── link.service.ts      ← İş mantığı ve veritabanı işlemleri
├── link.routes.ts       ← HTTP endpoint'leri
└── link.helpers.ts      ← Yardımcı fonksiyonlar (metadata parse, blockTheme merge vb.)
```

---

## TODO

### Bölüm 6.1 — Yardımcı Fonksiyonlar

- [ ] `apps/api/src/modules/link/link.helpers.ts` oluştur:
  ```typescript
  import { z } from 'zod'
  import {
    LinkBasicMetaSchema, LinkMusicMetaSchema, LinkBookMetaSchema,
    LinkVideoMetaSchema, LinkProductMetaSchema, SocialMetaSchema,
    HeaderMetaSchema, DividerMetaSchema, EmbedMetaSchema,
    ImageMetaSchema, MapMetaSchema, FaqMetaSchema,
    ContactFormMetaSchema, CollectionMetaSchema,
    EmailCaptureMetaSchema, ContactDetailsMetaSchema, SocialProofMetaSchema,
    ErrorCodes,
  } from '@taplink/validations'

  // Block tipine + card stiline göre doğru metadata şemasını seçer
  // "late binding validation" — tip belli olunca doğru validator devreye girer
  export function getMetadataSchema(
    type: string,
    cardStyle?: string | null
  ): z.ZodTypeAny | null {
    switch (type) {
      case 'LINK':
        switch (cardStyle) {
          case 'music':   return LinkMusicMetaSchema
          case 'book':    return LinkBookMetaSchema
          case 'video':   return LinkVideoMetaSchema
          case 'product': return LinkProductMetaSchema
          default:        return LinkBasicMetaSchema  // 'basic' ve diğerleri
        }
      case 'SOCIAL':           return SocialMetaSchema
      case 'HEADER':           return HeaderMetaSchema
      case 'DIVIDER':          return DividerMetaSchema
      case 'EMBED':            return EmbedMetaSchema
      case 'IMAGE':            return ImageMetaSchema
      case 'MAP':              return MapMetaSchema
      case 'FAQ':              return FaqMetaSchema
      case 'CONTACT_FORM':     return ContactFormMetaSchema
      case 'COLLECTION':       return CollectionMetaSchema
      case 'EMAIL_CAPTURE':    return EmailCaptureMetaSchema
      case 'CONTACT_DETAILS':  return ContactDetailsMetaSchema
      case 'SOCIAL_PROOF':     return SocialProofMetaSchema
      default:                 return null
    }
  }

  // Metadata'yı tipine göre parse eder — hata varsa null döner, hata kodu üretir
  export function parseMetadata(
    type: string,
    cardStyle: string | null | undefined,
    rawMetadata: unknown
  ): { data: unknown; error: string | null } {
    const schema = getMetadataSchema(type, cardStyle)
    if (!schema) {
      return { data: null, error: ErrorCodes.VALIDATION_ERROR }
    }
    if (!rawMetadata) {
      return { data: null, error: null }  // metadata opsiyonel
    }

    const result = schema.safeParse(rawMetadata)
    if (!result.success) {
      return { data: null, error: ErrorCodes.VALIDATION_ERROR }
    }
    return { data: result.data, error: null }
  }

  // PRO gerektiren card stilleri
  export const PRO_CARD_STYLES = new Set(['music', 'book', 'video', 'product'])

  // PRO gerektiren block tipleri
  // CONTACT_DETAILS ve SOCIAL_PROOF → FREE (herkes kullanabilir)
  export const PRO_BLOCK_TYPES = new Set([
    'IMAGE', 'MAP', 'FAQ', 'CONTACT_FORM', 'EMAIL_CAPTURE', 'COLLECTION',
  ])

  // Bu block'u oluşturmak/güncellemek için PRO gerekiyor mu?
  export function requiresProPlan(type: string, cardStyle?: string | null): boolean {
    if (PRO_BLOCK_TYPES.has(type)) return true
    if (type === 'LINK' && cardStyle && PRO_CARD_STYLES.has(cardStyle)) return true
    return false
  }

  // Zaman bazlı link kontrolü — ziyaretçi görünümünde kullanılır (Step 09)
  // Burada tanımlanıyor çünkü link service ve public API ortak kullanır
  export function checkLinkSchedule(
    isActive: boolean,
    startsAt: Date | null,
    endsAt: Date | null
  ): { visible: boolean; reason: string | null } {
    if (!isActive) return { visible: false, reason: 'inactive' }

    const now = new Date()
    if (startsAt && now < startsAt) return { visible: false, reason: ErrorCodes.LINK_NOT_SCHEDULED }
    if (endsAt && now > endsAt)     return { visible: false, reason: ErrorCodes.LINK_EXPIRED }

    return { visible: true, reason: null }
  }
  ```

### Bölüm 6.2 — Link Service

- [ ] `apps/api/src/modules/link/link.service.ts` oluştur:
  ```typescript
  import { prisma } from '@taplink/db'
  import bcrypt from 'bcryptjs'
  import { ErrorCodes } from '@taplink/validations'
  import type { CreateLinkInput, UpdateLinkInput, ReorderLinksInput } from '@taplink/validations'
  import { parseMetadata, requiresProPlan } from './link.helpers'

  // ─────────────────────────────────────────
  // OKUMA
  // ─────────────────────────────────────────

  // Profil sahibinin tüm bloklarını döner — sıralı, çocuklar dahil
  export async function getLinksByProfileId(profileId: string) {
    return prisma.link.findMany({
      where: {
        profileId,
        parentId: null,   // sadece kök bloklar — çocuklar include ile gelir
      },
      orderBy: { position: 'asc' },
      include: {
        children: {
          orderBy: { position: 'asc' },
          // password alanını döndürme — hash güvenli değil
          select: {
            id: true, type: true, title: true, url: true,
            cardStyle: true, metadata: true, position: true,
            isActive: true, isHighlighted: true,
            startsAt: true, endsAt: true,
            clickLimit: true,
            // password var mı? → boolean olarak
            password: false,  // doğrudan döndürme
          },
        },
      },
    })
  }

  // ─────────────────────────────────────────
  // OLUŞTURMA
  // ─────────────────────────────────────────

  export async function createLink(
    profileId: string,
    userPlan: string,
    input: CreateLinkInput
  ) {
    // Plan kontrolü
    if (requiresProPlan(input.type, input.cardStyle)) {
      if (userPlan === 'FREE') {
        return { error: ErrorCodes.SUBSCRIPTION_REQUIRED, link: null }
      }
    }

    // COLLECTION çocuğu ise parent'ın var olduğunu ve aynı profile ait olduğunu doğrula
    if (input.parentId) {
      const parent = await prisma.link.findFirst({
        where: { id: input.parentId, profileId },
      })
      if (!parent) {
        return { error: ErrorCodes.LINK_NOT_FOUND, link: null }
      }
      if (parent.type !== 'COLLECTION') {
        return { error: ErrorCodes.COLLECTION_CHILD_ERROR, link: null }
      }
      // Çocuğun çocuğu olamaz — parent'ın parentId'si varsa red
      if (parent.parentId) {
        return { error: ErrorCodes.COLLECTION_CHILD_ERROR, link: null }
      }
    }

    // Metadata parse — tip + cardStyle'a göre doğru şema
    const { data: parsedMeta, error: metaError } = parseMetadata(
      input.type,
      input.cardStyle ?? null,
      input.metadata
    )
    if (metaError) {
      return { error: metaError, link: null }
    }

    const link = await prisma.link.create({
      data: {
        profileId,
        type:      input.type as any,   // Prisma enum
        title:     input.title,
        url:       input.url ?? null,
        cardStyle: input.cardStyle ?? 'basic',
        metadata:  parsedMeta as any ?? undefined,
        position:  input.position,
        parentId:  input.parentId ?? null,
      },
    })

    return { error: null, link }
  }

  // ─────────────────────────────────────────
  // GÜNCELLEME
  // ─────────────────────────────────────────

  export async function updateLink(
    linkId: string,
    profileId: string,
    userPlan: string,
    input: UpdateLinkInput
  ) {
    // Link var mı ve bu profile ait mi?
    const existing = await prisma.link.findFirst({
      where: { id: linkId, profileId },
    })
    if (!existing) return { error: ErrorCodes.LINK_NOT_FOUND, link: null }

    // Yeni cardStyle PRO gerektiriyor mu?
    const newCardStyle = input.cardStyle ?? existing.cardStyle
    if (requiresProPlan(existing.type, newCardStyle) && userPlan === 'FREE') {
      return { error: ErrorCodes.SUBSCRIPTION_REQUIRED, link: null }
    }

    // Schedule ve password PRO özellikleri
    if (userPlan === 'FREE') {
      if (input.startsAt !== undefined || input.endsAt !== undefined) {
        return { error: ErrorCodes.SUBSCRIPTION_REQUIRED, link: null }
      }
      if (input.password !== undefined) {
        return { error: ErrorCodes.SUBSCRIPTION_REQUIRED, link: null }
      }
      if (input.clickLimit !== undefined) {
        return { error: ErrorCodes.SUBSCRIPTION_REQUIRED, link: null }
      }
    }

    // Metadata parse
    const { data: parsedMeta, error: metaError } = parseMetadata(
      existing.type,
      newCardStyle,
      input.metadata
    )
    if (metaError) return { error: metaError, link: null }

    // Şifre varsa hash'le, null ise kaldır
    let passwordHash: string | null | undefined = undefined
    if (input.password === null) {
      passwordHash = null     // şifreyi kaldır
    } else if (input.password) {
      passwordHash = await bcrypt.hash(input.password, 10)
    }

    const link = await prisma.link.update({
      where: { id: linkId },
      data: {
        title:         input.title,
        url:           input.url,
        cardStyle:     input.cardStyle,
        metadata:      parsedMeta as any ?? undefined,
        isActive:      input.isActive,
        isHighlighted: input.isHighlighted,
        startsAt:      input.startsAt ? new Date(input.startsAt) : input.startsAt,
        endsAt:        input.endsAt   ? new Date(input.endsAt)   : input.endsAt,
        password:      passwordHash,
        clickLimit:    input.clickLimit,
      },
    })

    return { error: null, link }
  }

  // ─────────────────────────────────────────
  // SİLME
  // ─────────────────────────────────────────

  export async function deleteLink(linkId: string, profileId: string) {
    const existing = await prisma.link.findFirst({
      where: { id: linkId, profileId },
    })
    if (!existing) return { error: ErrorCodes.LINK_NOT_FOUND }

    // COLLECTION silinince çocuklar otomatik silinir (onDelete: Cascade — Prisma şemasında tanımlı)
    await prisma.link.delete({ where: { id: linkId } })
    return { error: null }
  }

  // ─────────────────────────────────────────
  // SIRALAMA
  // ─────────────────────────────────────────

  export async function reorderLinks(
    profileId: string,
    input: ReorderLinksInput
  ) {
    // Tüm ID'lerin bu profile ait olduğunu doğrula
    const ids = input.links.map(l => l.id)
    const existing = await prisma.link.findMany({
      where: { id: { in: ids }, profileId },
      select: { id: true },
    })

    if (existing.length !== ids.length) {
      return { error: ErrorCodes.LINK_NOT_FOUND }
    }

    // Batch güncelleme — transaction ile atomik
    await prisma.$transaction(
      input.links.map(({ id, position }) =>
        prisma.link.update({
          where: { id },
          data:  { position },
        })
      )
    )

    return { error: null }
  }

  // ─────────────────────────────────────────
  // ŞİFRELİ LİNK GİRİŞİ
  // ─────────────────────────────────────────

  export async function unlockLink(linkId: string, password: string) {
    const link = await prisma.link.findUnique({
      where: { id: linkId },
      select: { password: true, isActive: true },
    })

    if (!link) return { error: ErrorCodes.LINK_NOT_FOUND, token: null }
    if (!link.password) return { error: null, token: 'no-password-required' }

    const match = await bcrypt.compare(password, link.password)
    if (!match) return { error: ErrorCodes.LINK_PASSWORD_INCORRECT, token: null }

    // Kısa süreli erişim token'ı — ziyaretçi bu token ile şifreli içeriği görür
    // Gerçek JWT yerine basit imzalı string (Step 09'da kullanılacak)
    // NOT: Bu token'ı Redis'te saklayabiliriz — şimdilik client'a dön, Step 09'da implement edilecek
    const token = Buffer.from(`${linkId}:${Date.now()}`).toString('base64')
    return { error: null, token }
  }
  ```

### Bölüm 6.3 — Link Routes

- [ ] `apps/api/src/modules/link/link.routes.ts` oluştur:
  ```typescript
  import { FastifyInstance } from 'fastify'
  import { requireAuth } from '../auth/auth.middleware'
  import { requirePlan } from '../../utils/plan'
  import {
    CreateLinkSchema, UpdateLinkSchema,
    ReorderLinksSchema, UnlockLinkSchema,
  } from '@taplink/validations'
  import {
    getLinksByProfileId, createLink, updateLink,
    deleteLink, reorderLinks, unlockLink,
  } from './link.service'

  export async function linkRoutes(fastify: FastifyInstance) {

    // ─────────────────────────────────────────
    // GET /api/links — Profil sahibinin bloklarını listele
    // ─────────────────────────────────────────
    fastify.get('/api/links', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user = req.user!
      const links = await getLinksByProfileId(user.profileId)

      // password alanını hasPassword boolean'ına dönüştür — hash asla dışarıya çıkmaz
      const sanitized = links.map(link => ({
        ...link,
        password:    undefined,
        hasPassword: !!link.password,
        children: link.children?.map(child => ({
          ...child,
          hasPassword: false,  // koleksiyon çocuklarında şifre yok
        })),
      }))

      return reply.send({ success: true, data: sanitized })
    })

    // ─────────────────────────────────────────
    // POST /api/links — Yeni block oluştur
    // ─────────────────────────────────────────
    fastify.post('/api/links', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user   = req.user!
      const parsed = CreateLinkSchema.safeParse(req.body)

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message,
        })
      }

      const { error, link } = await createLink(
        user.profileId,
        user.plan,
        parsed.data
      )

      if (error) {
        const status = error === 'SUBSCRIPTION_REQUIRED' ? 403 : 400
        return reply.status(status).send({ success: false, code: error })
      }

      return reply.status(201).send({ success: true, data: link })
    })

    // ─────────────────────────────────────────
    // PATCH /api/links/:id — Block güncelle
    // ─────────────────────────────────────────
    fastify.patch('/api/links/:id', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user    = req.user!
      const { id }  = req.params as { id: string }
      const parsed  = UpdateLinkSchema.safeParse(req.body)

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message,
        })
      }

      const { error, link } = await updateLink(
        id,
        user.profileId,
        user.plan,
        parsed.data
      )

      if (error) {
        const status = error === 'LINK_NOT_FOUND' ? 404
                     : error === 'SUBSCRIPTION_REQUIRED' ? 403 : 400
        return reply.status(status).send({ success: false, code: error })
      }

      return reply.send({ success: true, data: {
        ...link,
        password:    undefined,
        hasPassword: !!link!.password,
      }})
    })

    // ─────────────────────────────────────────
    // DELETE /api/links/:id — Block sil
    // ─────────────────────────────────────────
    fastify.delete('/api/links/:id', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user   = req.user!
      const { id } = req.params as { id: string }

      const { error } = await deleteLink(id, user.profileId)
      if (error) {
        return reply.status(404).send({ success: false, code: error })
      }

      return reply.status(204).send()
    })

    // ─────────────────────────────────────────
    // PUT /api/links/reorder — Toplu sıralama
    // ─────────────────────────────────────────
    fastify.put('/api/links/reorder', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user   = req.user!
      const parsed = ReorderLinksSchema.safeParse(req.body)

      if (!parsed.success) {
        return reply.status(400).send({ success: false, code: 'VALIDATION_ERROR' })
      }

      const { error } = await reorderLinks(user.profileId, parsed.data)
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
        return reply.status(400).send({ success: false, code: 'VALIDATION_ERROR' })
      }

      const { error, token } = await unlockLink(id, parsed.data.password)

      if (error) {
        const status = error === 'LINK_NOT_FOUND' ? 404 : 400
        return reply.status(status).send({ success: false, code: error })
      }

      return reply.send({ success: true, data: { token } })
    })
  }
  ```

### Bölüm 6.4 — Route'u Ana Uygulamaya Bağla

- [ ] `apps/api/src/app.ts` (veya `apps/api/src/index.ts`) içine link route'unu ekle:
  ```typescript
  import { linkRoutes } from './modules/link/link.routes'

  // Diğer plugin kayıtlarının yanına:
  app.register(linkRoutes)
  ```

### Bölüm 6.5 — bcryptjs Bağımlılığı

- [ ] `apps/api/package.json` içine ekle (zaten Step 04'te bcrypt kullanıldıysa bu adımı atla):
  ```bash
  pnpm --filter @taplink/api add bcryptjs
  pnpm --filter @taplink/api add -D @types/bcryptjs
  ```

### Bölüm 6.6 — Seed Güncellemesi (Test Verisi)

> Mevcut seed'e yeni block tipleri ekleniyor. PRO plan testi için user planını geçici olarak PRO yapabilirsin.

- [ ] `packages/db/prisma/seed.ts` içindeki link seed'ini genişlet — test için tüm block tiplerinden birer örnek ekle:
  ```typescript
  // packages/db/prisma/seed.ts içine ekle (profile.id mevcut olmalı)

  const links = await Promise.all([
    // HEADER
    prisma.link.create({
      data: {
        profileId: profile.id,
        type:      'HEADER',
        title:     'Müziğim',
        position:  0,
        metadata:  { alignment: 'center', size: 'md' },
      },
    }),
    // LINK basic
    prisma.link.create({
      data: {
        profileId: profile.id,
        type:      'LINK',
        title:     'Web Sitem',
        url:       'https://example.com',
        cardStyle: 'basic',
        position:  1,
        metadata:  { iconType: 'emoji', iconValue: '🌐' },
      },
    }),
    // LINK music (PRO)
    prisma.link.create({
      data: {
        profileId: profile.id,
        type:      'LINK',
        title:     'Son Albüm',
        url:       'https://open.spotify.com/album/example',
        cardStyle: 'music',
        position:  2,
        isHighlighted: true,
        metadata: {
          imageUrl: 'https://example.com/album-cover.jpg',
          artist:   'Sanatçı Adı',
          album:    'Albüm Adı',
          platform: 'spotify',
        },
      },
    }),
    // SOCIAL
    prisma.link.create({
      data: {
        profileId: profile.id,
        type:      'SOCIAL',
        title:     'Sosyal Medya',
        position:  3,
        metadata: {
          platforms: [
            { platform: 'instagram', url: 'https://instagram.com/example' },
            { platform: 'tiktok',    url: 'https://tiktok.com/@example' },
          ],
          iconStyle: 'filled',
          iconSize:  'md',
          layout:    'row',
        },
      },
    }),
    // DIVIDER
    prisma.link.create({
      data: {
        profileId: profile.id,
        type:      'DIVIDER',
        title:     'Ayraç',
        position:  4,
        metadata:  { style: 'solid', thickness: 1 },
      },
    }),
    // EMBED
    prisma.link.create({
      data: {
        profileId: profile.id,
        type:      'EMBED',
        title:     'YouTube Videosu',
        position:  5,
        metadata: {
          platform: 'youtube',
          embedId:  'dQw4w9WgXcQ',
        },
      },
    }),
  ])

  console.log(`✅ ${links.length} test link/block oluşturuldu`)
  ```

---

## Debug Notları

**"Cannot read properties of undefined (reading 'profileId')"**
→ `req.user` null geliyor — `requireAuth` middleware çalışmamış veya token geçersiz.
→ Step 04'te `requireAuth` doğru tanımlandığını kontrol et.
→ `preHandler: [requireAuth]` satırının route tanımında olduğunu doğrula.

**"Record to update not found" (Prisma P2025)**
→ `prisma.link.update()` var olmayan bir kayıt güncellemeye çalıştı.
→ Service'te her zaman önce `findFirst` ile kontrol edilmeli — yukarıdaki kodda var.
→ Eğer yine de çıkıyorsa ID yanlış geliyor olabilir — `req.params.id` logla.

**"Invalid value for argument `type`" (Prisma)**
→ `type` alanına Prisma enum'da olmayan bir değer gönderildi.
→ `CreateLinkSchema`'daki `z.nativeEnum(...)` listesi Prisma `LinkType` enum'u ile birebir eşleşmeli.
→ Step 02'deki enum değerlerini kontrol et.

**Metadata validasyon hatası görünmüyor, her şey kaydediliyor**
→ `parseMetadata()` fonksiyonuna `type` ve `cardStyle` doğru gönderilmiyor olabilir.
→ `link.helpers.ts` içindeki `getMetadataSchema()` fonksiyonunu console.log ile test et.
→ `metadata: z.record(z.unknown())` route katmanında her şeyi geçirir — gerçek validasyon service'te.

**Collection çocuğu ekleyemiyorum**
→ `parentId` gönderilen link'in `type = 'COLLECTION'` olması gerekiyor.
→ `parentId` olan bir link'e başka `parentId` eklenemez (nested collection yasak).
→ Hata kodu `COLLECTION_CHILD_ERROR` dönmeli — frontend'de bu kodu kontrol et.

**Şifreli link: "bcrypt hash invalid" hatası**
→ `bcrypt.compare()` için verilen hash Prisma'dan düzgün gelmiyor olabilir — `select: { password: true }` olduğundan emin ol.
→ Seed'de oluşturulan linklerde `password` alanı null — önce `updateLink` ile şifre set et.

**`PUT /api/links/reorder` 404 döndürüyor**
→ Gönderilen ID'lerden en az biri bu profil'e ait değil.
→ Frontend sadece aktif kullanıcının linklerinin ID'lerini göndermeli.

---

## Güvenlik Notları

- `password` alanı **asla** response'da dönmez — her yerde `hasPassword: boolean` olarak dönüştürülür. Birini unutursan hash client'a sızar.
- `parentId` kontrolü zorunlu — başka kullanıcının collection'ına çocuk eklenemez.
- `profileId` her sorguda `WHERE` koşuluna dahil edilmeli — ID tahmin ederek başka kullanıcının linkini değiştirme engellenir.
- Şifreli link token'ı şimdilik basit base64 — Step 09'da Redis ile kısa ömürlü token sistemine geçilecek.
- `clickLimit` kontrolü Step 09'da public profil API'da yapılacak — ziyaretçi tıklayınca sayaç Redis'te artırılır.

---

## Teslim Kriterleri

- [ ] `GET /api/links` giriş yapmış kullanıcının linklerini döndürüyor, `password` alanı response'da yok
- [ ] `POST /api/links` yeni block oluşturuyor, metadata doğru şemayla valide ediliyor
- [ ] `PATCH /api/links/:id` güncelleme çalışıyor; başka kullanıcının linki güncellenemiyor (404)
- [ ] `DELETE /api/links/:id` silme çalışıyor; COLLECTION silinince çocukları da siliniyor
- [ ] `PUT /api/links/reorder` toplu sıralama çalışıyor
- [ ] `POST /api/links/:id/unlock` doğru şifre token döndürüyor, yanlış şifre `LINK_PASSWORD_INCORRECT` döndürüyor
- [ ] FREE kullanıcı `cardStyle: 'music'` ile link oluşturmaya çalışınca `SUBSCRIPTION_REQUIRED` alıyor
- [ ] FREE kullanıcı `startsAt` ile link güncellemeye çalışınca `SUBSCRIPTION_REQUIRED` alıyor
- [ ] COLLECTION block'una çocuk eklenebiliyor, çocuğa başka çocuk eklenince `COLLECTION_CHILD_ERROR` alınıyor
- [ ] Seed çalıştırılınca 6 farklı block tipi oluşturuluyor
