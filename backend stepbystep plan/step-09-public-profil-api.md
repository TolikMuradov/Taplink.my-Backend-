# Step 09 — Public Profil API

**Bağımlılık:** Step 01–08 tamamlanmış olmalı.  
**Sonraki Step:** Step 10 (Contact Form / Leads), Step 11 (Rate Limiting), Step 12 (Stripe).

> ⚠️ **Bu step projenin en kritik parçasıdır.** Tüm ziyaretçiler bu API üzerinden geçer. Bir influencer'ın 1M takipçisinden aynı anda 50k kişi geldiğinde bu endpoint ayakta durmalı. Mimariyi anlamadan yazmaya başlama — önce "Neden Bu Kararlar?" bölümünü oku.

---

## Amaç

`taplink.my/username` adresini ziyaret eden kişilerin gördüğü profil verisini sunmak. Bu step bittiğinde:

- Ziyaretçi profil açınca backend'e sıfır (veya çok nadir) veritabanı sorgusu gider
- Link tıklamaları Redis'e anlık kaydedilir, URL döndürülür
- Zamanlama, şifre, tıklama limiti kontrolleri çalışır
- Profil sahibi içerik güncellediğinde cache otomatik temizlenir
- Profil gizliyse ziyaretçi 404 alır

---

## Neden Bu Kararlar?

### Büyük trafik problemi — 50k eş zamanlı ziyaretçi

Senaryo: 1M Instagram takipçisi olan bir kullanıcı story paylaşıyor, "linktree'deki linke bak" diyor. 30 dakika içinde 50k tekil ziyaretçi geliyor.

**Naif yaklaşım (yanlış):**
```
Her ziyaretçi → GET /api/p/username → DB sorgusu → cevap
50k istek → 50k DB sorgusu → Neon bağlantı havuzu tükenir → servis çöker
```

**Doğru yaklaşım — iki katmanlı cache:**

```
Ziyaretçi isteği
  │
  ▼
Vercel CDN (katman 1)
  ├── Cache HIT (çoğu istek buraya düşer) → statik HTML anında döner, backend hiç görmez
  └── Cache MISS / ISR revalidation
        │
        ▼
      Backend API
        │
        ▼
      Upstash Redis (katman 2) — TTL: 60 saniye
        ├── Cache HIT → JSON döner, DB hiç görmez
        └── Cache MISS (ilk istek veya cache expire)
              │
              ▼
            PostgreSQL → veri çek → Redis'e yaz → döndür
```

**Sonuç:**
- 50k ziyaretçinin %99'u: Vercel CDN → sıfır backend
- ISR revalidation: 60 saniyede bir, 1 backend isteği
- O 1 istek: Redis hit → sıfır DB sorgusu
- DB yükü: neredeyse sıfır

### ISR (Incremental Static Regeneration) nedir?

Next.js'e özgü bir özellik. Profil sayfası (`apps/web/src/app/[username]/page.tsx`) şöyle tanımlanır:

```typescript
// apps/web/src/app/[username]/page.tsx
export const revalidate = 60  // 60 saniyede bir yenile

export default async function ProfilePage({ params }) {
  const data = await fetch(`${API_URL}/api/p/${params.username}`)
  // ...
}
```

Ne olur:
1. İlk ziyaretçi gelir → Next.js sayfayı render eder → Vercel CDN'e kaydeder
2. Sonraki 59 saniye: tüm ziyaretçiler CDN'den aynı HTML'yi alır — backend hiç çalışmaz
3. 60. saniyede arka planda ISR yeniler → yeni HTML CDN'e yazar
4. Kullanıcı profil güncellediğinde: `revalidatePath('/username')` çağrısı → CDN cache'i anında temizler

### Redis profile cache neden var? ISR yetmez mi?

ISR 60 saniyede yenileniyor demek ISR revalidation sırasında backend 1 istek alıyor demek. Bu istek DB'ye gitmemeli — Redis'ten gelmeli. Ayrıca:

- Manuel güncelleme sonrası `revalidatePath` cache sıfırlandığında ilk isteğe anında cevap vermek için Redis gerekli
- Farklı önbellekleme katmanları birbirini tamamlar

### Tıklama neden `/api/p/r/:linkId` endpoint'inden geçiyor?

Ziyaretçi bir linke tıklayınca frontend doğrudan `window.location = link.url` yapabilirdi. Neden yapmıyoruz?

1. **Tıklama sayımı:** URL'ye gitmeden önce `recordClick()` çağrılmalı
2. **clickLimit kontrolü:** Limit dolduysa URL verilmemeli
3. **Şifre kontrolü:** Token geçerli mi doğrulanmalı
4. **Zamanlama kontrolü:** Zaman penceresi açık mı?
5. **Güvenlik:** URL'yi profil verisiyle birlikte göndermek şifreli ve limitli linkleri açık eder

Çözüm: Tıklama backend'den geçer, kontroller yapılır, URL döndürülür, frontend yönlendirir.

### Neden 302 redirect değil, URL döndürme?

`GET /api/p/r/:linkId` → 302 → link URL olsaydı tarayıcı direkt giderdi. Ama:

- Şifre kontrolü için token göndermek gerekiyor (query param çirkin, POST daha temiz)
- Frontend SPA'da `router.push()` ile yönlendirmek daha kontrollü
- Analytics event'ini göndermeden önce loading state göstermek mümkün

Bu yüzden `POST /api/p/r/:linkId` → `{ url }` döner, frontend yönlendirir.

### Cache invalidation — en çok unutulan kısım

Kullanıcı profil güncellediğinde veya link eklediğinde eski cache hala sunulur. Bu kabul edilemez. İki yerde invalidation çağrılmalı:

```
profile.service.ts → updateProfile() sonunda → invalidateProfileCache(username)
link.service.ts    → createLink/updateLink/deleteLink/reorderLinks sonunda → invalidateProfileCache(username)
upload.service.ts  → avatar/background yükleme sonunda → invalidateProfileCache(username)
```

---

## Gereksinimler

- Step 04 tamamlanmış (Redis client)
- Step 06 tamamlanmış (link modeli, şifreli link)
- Step 08 tamamlanmış (`recordClick()`, `recordView()`)
- Step 09 hiç auth gerektirmez — ziyaretçi endpoint'i

---

## Klasör Yapısı (Hedef)

```
apps/api/src/modules/public/
├── public.service.ts     ← Profil verisi çekme, filtreleme, cache
├── public.routes.ts      ← Ziyaretçi endpoint'leri
└── public.helpers.ts     ← IP parse, User-Agent parse, token doğrulama

apps/api/src/lib/
└── cache.ts              ← invalidateProfileCache() — tüm modüller buradan çağırır
```

---

## TODO

### Bölüm 9.1 — Cache Yardımcısı (Merkezi)

Bu fonksiyon hem public service hem diğer modüller (profile, link, upload) tarafından kullanılır. Tek yerde tanımlanmalı.

- [ ] `apps/api/src/lib/cache.ts` oluştur:
  ```typescript
  import { redis } from '../lib/redis'  // Ortak Redis client — Step 04'ten

  // Cache key formatı
  // Tüm proje genelinde tutarlı olması için buradan üret
  export function profileCacheKey(username: string): string {
    return `taplink:profile:${username.toLowerCase()}`
  }

  // Profil cache'ini sil
  // Ne zaman çağrılır:
  //   - Profil güncelleme (profile.service.ts)
  //   - Link ekleme/güncelleme/silme/sıralama (link.service.ts)
  //   - Avatar/arkaplan yükleme (upload.service.ts)
  export async function invalidateProfileCache(username: string): Promise<void> {
    await redis.del(profileCacheKey(username))
    // NOT: Vercel ISR cache'ini de temizlemek için revalidatePath çağrısı
    // gerekir — bu Next.js tarafında yapılır (apps/web).
    // Backend sadece Redis'i temizler.
  }

  // TTL sabitleri — tek yerden yönetilsin
  export const CACHE_TTL = {
    profile: 60,        // saniye — public profil cache
    session: 60 * 60,  // 1 saat — session data
  } as const
  ```

### Bölüm 9.2 — Public Yardımcılar

- [ ] `apps/api/src/modules/public/public.helpers.ts` oluştur:
  ```typescript
  import { FastifyRequest } from 'fastify'

  // ─────────────────────────────────────────
  // ZİYARETÇİ IP ADRESİ
  // Cloudflare arkasında gerçek IP CF-Connecting-IP header'ındadır
  // Direkt bağlantıda remoteAddress kullanılır
  // ─────────────────────────────────────────
  export function getVisitorIp(req: FastifyRequest): string {
    // Cloudflare → CF-Connecting-IP
    const cfIp = req.headers['cf-connecting-ip']
    if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp

    // Reverse proxy → X-Forwarded-For (ilk IP gerçek ziyaretçi)
    const forwarded = req.headers['x-forwarded-for']
    if (forwarded) {
      const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')
      return ips[0].trim()
    }

    return req.socket.remoteAddress ?? 'unknown'
  }

  // ─────────────────────────────────────────
  // CİHAZ TİPİ
  // User-Agent'tan basit cihaz tespiti
  // Tam doğruluk gerekmez — analitik için yaklaşık yeterli
  // ─────────────────────────────────────────
  export function getDeviceType(req: FastifyRequest): string {
    const ua = (req.headers['user-agent'] ?? '').toLowerCase()
    if (/tablet|ipad/.test(ua))  return 'tablet'
    if (/mobile|android|iphone/.test(ua)) return 'mobile'
    return 'desktop'
  }

  // ─────────────────────────────────────────
  // REFERRER (Trafik Kaynağı)
  // Referer header'dan gelir, max 200 karakter
  // ─────────────────────────────────────────
  export function getReferrer(req: FastifyRequest): string | null {
    const ref = req.headers['referer'] ?? req.headers['referrer']
    if (!ref) return null
    const refStr = Array.isArray(ref) ? ref[0] : ref
    // Sadece domain kısmını al — tam URL'yi kaydetme (gizlilik)
    try {
      const url = new URL(refStr)
      return url.hostname.slice(0, 100)  // max 100 karakter
    } catch {
      return null
    }
  }

  // ─────────────────────────────────────────
  // ÜLKE KODU
  // Cloudflare her isteğe CF-IPCountry header'ı ekler (2 harfli ISO kod)
  // Örnek: "TH" (Tayland), "ID" (Endonezya)
  // Cloudflare arkasında değilsek null döner — geliştirme ortamı
  // ─────────────────────────────────────────
  export function getCountry(req: FastifyRequest): string | null {
    const country = req.headers['cf-ipcountry']
    if (!country) return null
    const code = Array.isArray(country) ? country[0] : country
    // "XX" = Cloudflare bilinmeyen, "T1" = Tor — null döndür
    if (code === 'XX' || code === 'T1') return null
    return code.toUpperCase().slice(0, 2)
  }

  // ─────────────────────────────────────────
  // ŞİFRE TOKEN DOĞRULAMA
  // Step 06'da /api/links/:id/unlock endpoint'i token üretir
  // Ziyaretçi bu token'ı click isteğine ekler
  // Token formatı: base64("linkId:timestamp")
  // ─────────────────────────────────────────
  const TOKEN_MAX_AGE_MS = 30 * 60 * 1000  // 30 dakika

  export function verifyUnlockToken(token: string, linkId: string): boolean {
    try {
      const decoded   = Buffer.from(token, 'base64').toString('utf8')
      const [tokenId, timestampStr] = decoded.split(':')
      const timestamp = parseInt(timestampStr, 10)

      if (tokenId !== linkId) return false
      if (isNaN(timestamp))   return false
      if (Date.now() - timestamp > TOKEN_MAX_AGE_MS) return false  // 30 dakika geçmiş

      return true
    } catch {
      return false
    }
  }
  ```

### Bölüm 9.3 — Public Service

- [ ] `apps/api/src/modules/public/public.service.ts` oluştur:
  ```typescript
  import { prisma }            from '@taplink/db'
  import { redis }             from '../../lib/redis'
  import { profileCacheKey, CACHE_TTL } from '../../lib/cache'
  import { checkLinkSchedule } from '../link/link.helpers'
  import { ErrorCodes }        from '@taplink/validations'
  import { DEFAULT_DESIGN }    from '@taplink/types'

  // ─────────────────────────────────────────
  // ANA FONKSİYON — Ziyaretçiye gösterilecek profil verisi
  // ─────────────────────────────────────────

  export async function getPublicProfile(username: string): Promise<{
    error: string | null
    data:  PublicProfileData | null
  }> {
    const cacheKey = profileCacheKey(username)

    // ── 1. Redis cache kontrolü ──────────────
    const cached = await redis.get(cacheKey)
    if (cached) {
      return { error: null, data: JSON.parse(cached) }
    }

    // ── 2. Veritabanı sorgusu ────────────────
    const profile = await prisma.profile.findFirst({
      where: { username: username.toLowerCase() },
      select: {
        id:             true,
        username:       true,
        displayName:    true,
        bio:            true,
        avatarUrl:      true,
        backgroundUrl:  true,
        designSettings: true,
        isPublic:       true,
        seoTitle:       true,
        seoDescription: true,
        links: {
          where: {
            parentId: null,   // sadece kök bloklar
            isActive: true,   // pasif bloklar gösterilmez
          },
          orderBy: { position: 'asc' },
          select: {
            id:            true,
            type:          true,
            title:         true,
            url:           true,
            cardStyle:     true,
            metadata:      true,
            position:      true,
            isHighlighted: true,
            startsAt:      true,
            endsAt:        true,
            password:      true,   // hash — hasPassword için gerekli
            clickLimit:    true,
            _count: {
              select: { clicks: true }  // clickLimit kontrolü için
            },
            children: {
              where:   { isActive: true },
              orderBy: { position: 'asc' },
              select: {
                id:            true,
                type:          true,
                title:         true,
                url:           true,
                cardStyle:     true,
                metadata:      true,
                position:      true,
                isHighlighted: true,
                password:      true,
                clickLimit:    true,
                _count: { select: { clicks: true } },
              },
            },
          },
        },
      },
    })

    // ── 3. Profil bulunamadı veya gizli ──────
    if (!profile) {
      return { error: ErrorCodes.PROFILE_NOT_FOUND, data: null }
    }
    if (!profile.isPublic) {
      return { error: ErrorCodes.PROFILE_IS_PRIVATE, data: null }
    }

    // ── 4. Linkleri filtrele ve temizle ──────
    const filteredLinks = profile.links
      .map(link => filterAndSanitizeLink(link))
      .filter(Boolean) as PublicLink[]

    // ── 5. DesignSettings varsayılan değerleriyle birleştir ──
    const design = (profile.designSettings ?? DEFAULT_DESIGN) as any

    // ── 6. Response objesi ───────────────────
    const data: PublicProfileData = {
      username:       profile.username,
      displayName:    profile.displayName,
      bio:            profile.bio,
      avatarUrl:      profile.avatarUrl,
      backgroundUrl:  profile.backgroundUrl,
      designSettings: design,
      seoTitle:       profile.seoTitle ?? profile.displayName ?? profile.username,
      seoDescription: profile.seoDescription ?? profile.bio,
      links:          filteredLinks,
    }

    // ── 7. Redis'e yaz (TTL: 60 saniye) ──────
    await redis.setex(cacheKey, CACHE_TTL.profile, JSON.stringify(data))

    return { error: null, data }
  }

  // ─────────────────────────────────────────
  // LİNK FİLTRELEME VE TEMİZLEME
  // Ziyaretçiye gösterilmemesi gereken alanları gizler
  // ─────────────────────────────────────────

  type RawLink = {
    id: string; type: string; title: string; url: string | null
    cardStyle: string; metadata: any; position: number
    isHighlighted: boolean; startsAt: Date | null; endsAt: Date | null
    password: string | null; clickLimit: number | null
    _count: { clicks: number }
    children?: RawLink[]
  }

  function filterAndSanitizeLink(link: RawLink): PublicLink | null {
    // Zamanlama kontrolü
    const { visible, reason } = checkLinkSchedule(true, link.startsAt, link.endsAt)
    if (!visible) return null  // zamanı geçmiş veya henüz başlamadı

    // clickLimit kontrolü
    if (link.clickLimit !== null && link._count.clicks >= link.clickLimit) {
      return null  // limit doldu — görünmez
    }

    const hasPassword = !!link.password

    return {
      id:            link.id,
      type:          link.type,
      title:         link.title,
      // Şifreli linkler: URL gizlenir — ziyaretçi önce şifre girmeli
      url:           hasPassword ? null : link.url,
      cardStyle:     link.cardStyle,
      // Şifreli linkte metadata da gizlenir (albüm kapağı, fiyat vs. sızmasın)
      metadata:      hasPassword ? null : link.metadata,
      position:      link.position,
      isHighlighted: link.isHighlighted,
      hasPassword,
      children:      link.children
        ?.map(child => filterAndSanitizeLink(child))
        .filter(Boolean) as PublicLink[] | undefined,
    }
  }

  // ─────────────────────────────────────────
  // TİP TANIMLAMALARI
  // ─────────────────────────────────────────

  export type PublicLink = {
    id:            string
    type:          string
    title:         string
    url:           string | null     // şifreli linkde null
    cardStyle:     string
    metadata:      any | null        // şifreli linkde null
    position:      number
    isHighlighted: boolean
    hasPassword:   boolean
    children?:     PublicLink[]
  }

  export type PublicProfileData = {
    username:       string
    displayName:    string | null
    bio:            string | null
    avatarUrl:      string | null
    backgroundUrl:  string | null
    designSettings: any
    seoTitle:       string | null
    seoDescription: string | null
    links:          PublicLink[]
  }

  // ─────────────────────────────────────────
  // LİNK TIKLAMA — Cache'ten veya DB'den link bul, kontrol et
  // ─────────────────────────────────────────

  export async function processLinkClick(
    linkId:      string,
    unlockToken: string | null
  ): Promise<{ error: string | null; url: string | null }> {

    // Linki bul — sadece gerekli alanlar
    const link = await prisma.link.findUnique({
      where:  { id: linkId },
      select: {
        url:       true,
        isActive:  true,
        startsAt:  true,
        endsAt:    true,
        password:  true,
        clickLimit: true,
        _count: { select: { clicks: true } },
      },
    })

    if (!link)          return { error: ErrorCodes.LINK_NOT_FOUND,  url: null }
    if (!link.isActive) return { error: ErrorCodes.LINK_NOT_FOUND,  url: null }
    if (!link.url)      return { error: ErrorCodes.LINK_NOT_FOUND,  url: null }

    // Zamanlama
    const { visible, reason } = checkLinkSchedule(link.isActive, link.startsAt, link.endsAt)
    if (!visible) return { error: reason ?? ErrorCodes.LINK_NOT_FOUND, url: null }

    // clickLimit
    if (link.clickLimit !== null && link._count.clicks >= link.clickLimit) {
      return { error: ErrorCodes.LINK_CLICK_LIMIT_REACHED, url: null }
    }

    // Şifre kontrolü
    if (link.password) {
      if (!unlockToken) return { error: ErrorCodes.LINK_PASSWORD_INCORRECT, url: null }

      const { verifyUnlockToken } = await import('./public.helpers')
      if (!verifyUnlockToken(unlockToken, linkId)) {
        return { error: ErrorCodes.LINK_PASSWORD_INCORRECT, url: null }
      }
    }

    return { error: null, url: link.url }
  }
  ```

### Bölüm 9.4 — Public Routes

- [ ] `apps/api/src/modules/public/public.routes.ts` oluştur:
  ```typescript
  import { FastifyInstance }  from 'fastify'
  import { getPublicProfile, processLinkClick } from './public.service'
  import { recordClick, recordView }            from '../analytics/analytics.service'
  import { getVisitorIp, getDeviceType, getReferrer, getCountry } from './public.helpers'
  import { ErrorCodes }       from '@taplink/validations'

  export async function publicRoutes(fastify: FastifyInstance) {

    // ─────────────────────────────────────────
    // GET /api/p/:username — Profil verisi
    // Auth yok — ziyaretçi endpoint'i
    // ─────────────────────────────────────────
    fastify.get('/api/p/:username', async (req, reply) => {
      const { username } = req.params as { username: string }

      const { error, data } = await getPublicProfile(username)

      if (error === ErrorCodes.PROFILE_NOT_FOUND) {
        return reply.status(404).send({ success: false, code: error })
      }
      if (error === ErrorCodes.PROFILE_IS_PRIVATE) {
        // Private profil → 404 döndür (profil var ama gizli olduğunu açığa vurma)
        return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })
      }

      // Cache header — CDN ve tarayıcı 60 saniye cache yapsın
      // s-maxage: CDN için | max-age: tarayıcı için | stale-while-revalidate: arka planda yenile
      reply.header(
        'Cache-Control',
        'public, s-maxage=60, max-age=30, stale-while-revalidate=120'
      )

      return reply.send({ success: true, data })
    })

    // ─────────────────────────────────────────
    // POST /api/p/:username/view — Profil görüntüleme kaydet
    // Frontend profil yüklenince çağırır (bir kez)
    // Auth yok
    // ─────────────────────────────────────────
    fastify.post('/api/p/:username/view', async (req, reply) => {
      const { username } = req.params as { username: string }

      // Profil var mı kontrol et — cache'ten gelir, DB'ye gitmez
      const { error, data } = await getPublicProfile(username)
      if (error || !data) {
        return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })
      }

      // profileId için DB'den alalım — public profile data'da yok (güvenlik)
      // Bu bilgi cache'e eklenebilir ama şimdilik basit tut
      const profile = await import('@taplink/db').then(m =>
        m.prisma.profile.findFirst({
          where:  { username: username.toLowerCase() },
          select: { id: true },
        })
      )
      if (!profile) return reply.status(404).send({ success: false })

      const ip = getVisitorIp(req)

      // Görüntülemeyi async kaydet — ziyaretçiyi beklettirme
      recordView({
        profileId: profile.id,
        visitorIp: ip,
        timestamp: Date.now(),
      }).catch(() => {})  // hata sessizce geçer — analytics kritik değil

      return reply.status(204).send()
    })

    // ─────────────────────────────────────────
    // POST /api/p/r/:linkId — Link tıklama
    // Body: { unlockToken?: string }
    // Auth yok — ziyaretçi
    // ─────────────────────────────────────────
    fastify.post('/api/p/r/:linkId', async (req, reply) => {
      const { linkId } = req.params as { linkId: string }
      const body = req.body as { unlockToken?: string } | undefined
      const unlockToken = body?.unlockToken ?? null

      // Tıklama kontrolü (schedule, password, clickLimit)
      const { error, url } = await processLinkClick(linkId, unlockToken)

      if (error) {
        const status =
          error === ErrorCodes.LINK_NOT_FOUND            ? 404 :
          error === ErrorCodes.LINK_PASSWORD_INCORRECT   ? 401 :
          error === ErrorCodes.LINK_CLICK_LIMIT_REACHED  ? 410 :
          error === ErrorCodes.LINK_NOT_SCHEDULED        ? 410 :
          error === ErrorCodes.LINK_EXPIRED              ? 410 : 400

        return reply.status(status).send({ success: false, code: error })
      }

      // profileId'yi linkId'den bul (cache'e eklenebilir, şimdilik DB)
      const linkRecord = await import('@taplink/db').then(m =>
        m.prisma.link.findUnique({
          where:  { id: linkId },
          select: { profileId: true },
        })
      )

      if (linkRecord) {
        // Tıklamayı async kaydet — ziyaretçiyi beklettirme
        recordClick({
          profileId: linkRecord.profileId,
          linkId,
          country:   getCountry(req),
          device:    getDeviceType(req),
          referrer:  getReferrer(req),
          timestamp: Date.now(),
        }).catch(() => {})
      }

      // URL döndür — frontend yönlendirmeyi yapar
      return reply.send({ success: true, data: { url } })
    })
  }
  ```

### Bölüm 9.5 — Cache Invalidation'ı Diğer Servislere Ekle

Profil veya link değiştiğinde Redis cache temizlenmeli. Aşağıdaki servisleri güncelle:

- [ ] `apps/api/src/modules/profile/profile.service.ts` — `updateProfile` fonksiyonunun sonuna ekle:
  ```typescript
  import { invalidateProfileCache } from '../../lib/cache'

  // updateProfile fonksiyonu sonuna:
  await invalidateProfileCache(profile.username)
  ```

- [ ] `apps/api/src/modules/link/link.service.ts` — `createLink`, `updateLink`, `deleteLink`, `reorderLinks` fonksiyonlarının sonuna ekle:
  ```typescript
  import { invalidateProfileCache } from '../../lib/cache'

  // Her fonksiyon sonuna — username'e ihtiyaç var, profileId'den çek:
  const prof = await prisma.profile.findUnique({
    where:  { id: profileId },
    select: { username: true },
  })
  if (prof) await invalidateProfileCache(prof.username)
  ```

- [ ] `apps/api/src/modules/upload/upload.routes.ts` — avatar ve background yükleme sonrasına ekle:
  ```typescript
  import { invalidateProfileCache } from '../../lib/cache'

  // Avatar/background yükleme başarılı olduktan sonra:
  const prof = await prisma.profile.findUnique({
    where:  { userId: user.id },
    select: { username: true },
  })
  if (prof) await invalidateProfileCache(prof.username)
  ```

### Bölüm 9.6 — Ana Uygulamaya Bağla

- [ ] `apps/api/src/app.ts` içine ekle:
  ```typescript
  import { publicRoutes } from './modules/public/public.routes'

  app.register(publicRoutes)
  ```

### Bölüm 9.7 — Frontend Entegrasyon Notu (Bilgi Amaçlı)

> Bu step backend — frontend developer'ın bilmesi için:

```typescript
// apps/web/src/app/[username]/page.tsx

export const revalidate = 60  // ISR: 60 saniyede bir arka planda yenile

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const res = await fetch(`${process.env.API_URL}/api/p/${params.username}`, {
    next: { tags: [`profile:${params.username}`] }  // tag bazlı revalidation için
  })

  if (!res.ok) notFound()

  const { data } = await res.json()
  return <ProfileView data={data} />
}

// Profil sahibi güncelleme yaptığında backend şunu çağırır (Next.js revalidate API):
// fetch(`${process.env.NEXTJS_REVALIDATE_URL}/api/revalidate?tag=profile:${username}&secret=TOKEN`)
```

**Revalidation endpoint'i Next.js'e eklemek gerekir** (`apps/web/src/app/api/revalidate/route.ts`). Bu frontend step'i — ama developer bilmeli.

---

## Debug Notları

**`GET /api/p/:username` her seferinde DB sorgusu yapıyor, Redis kullanmıyor**
→ `redis.get()` null dönüyor — Redis bağlantısını kontrol et.
→ `redis.setex()` çağrısından sonra TTL'yi doğrula: `redis.ttl('taplink:profile:username')` — pozitif sayı dönmeli.
→ Cache key büyük/küçük harf uyumsuzluğu: `username.toLowerCase()` tutarlı kullanıldığını doğrula.

**Kullanıcı profil güncelledi ama eski veri gelmeye devam ediyor**
→ `invalidateProfileCache()` çağrısı eklenmemiş olabilir — profile.service.ts ve link.service.ts kontrol et.
→ Vercel ISR cache'i temizlenmemiş olabilir — `revalidatePath()` çağrısı Next.js tarafında eklenmeli.
→ Redis'ten key'in silindiğini doğrula: `redis.exists('taplink:profile:username')` → 0 dönmeli.

**Şifreli link URL'si response'da görünüyor**
→ `filterAndSanitizeLink()` fonksiyonunda `hasPassword` kontrolü gözden kaçmış.
→ `url: hasPassword ? null : link.url` satırını kontrol et.
→ Cache'te eski (şifresiz) veri olabilir — `invalidateProfileCache()` çağrıldığından emin ol.

**`POST /api/p/r/:linkId` 401 dönüyor — şifre doğru ama token geçersiz**
→ Token 30 dakika sonra expire oluyor — kullanıcı unlock yaptıktan uzun süre sonra tıkladı.
→ Token linkId ile eşleşmiyor olabilir — frontend doğru linkId ile token üretiyor mu kontrol et.
→ `verifyUnlockToken()` içindeki base64 decode'u logla.

**clickLimit dolduğunda link hala görünüyor**
→ `_count.clicks` sorgusu Redis buffer'daki tıklamaları saymıyor — sadece DB'deki.
→ Batch job 5 dakikada bir flush yapıyor — bu süre içindeki tıklamalar sayılmaz.
→ Bu kabul edilebilir bir gecikme. Gerçek zamanlı limit için Redis counter eklenmeli (ilerleyen aşama).

**Ülke kodu null geliyor**
→ Geliştirme ortamında Cloudflare yok — `CF-IPCountry` header'ı gönderilmiyor. Bu beklenen durum.
→ Production'da Cloudflare proxy aktif olduğunda otomatik çalışır.
→ Geliştirmede test için: `req.headers['cf-ipcountry'] = 'TH'` mock edebilirsin.

**`PROFILE_IS_PRIVATE` yerine `PROFILE_NOT_FOUND` dönüyor ama profil var**
→ Bu tasarım gereği. Gizli profil var mı yok mu bilgisi dışarıya sızdırılmamalı.
→ Sadece profil sahibi (giriş yapmış) kendi gizli profilini görebilir — bu Step 05'te halledilebilir.

**Profil cache hit oranı düşük (Redis sürekli miss)**
→ TTL çok kısa ayarlanmış olabilir — `CACHE_TTL.profile` değerini kontrol et.
→ `invalidateProfileCache()` çok sık çağrılıyor olabilir — her link tıklamasında çağrılmamalı, sadece içerik değişimlerinde.

---

## Güvenlik Notları

- Private profil varlığı açığa çıkarılmaz — her zaman `PROFILE_NOT_FOUND` döner.
- Şifreli link URL'si ve metadata'sı `null` döner — hash asla response'a girmez.
- clickLimit bypass için Redis counter yerine DB sayımı kullanılıyor — 5 dakikaya kadar aşılabilir. Kabul edilebilir.
- Unlock token 30 dakika geçerli, linkId ile kriptografik olarak bağlı — başka linkin token'ı kullanılamaz.
- Ziyaretçi IP'si DB'ye yazılmaz — sadece HyperLogLog'da anonim tutulur (GDPR).
- `Cache-Control: s-maxage=60` ile CDN 60 saniye cache yapar — saldırgan profil verisi için sürekli istek atamaz.
- `CF-Connecting-IP` header'ına güven — sadece Cloudflare proxy arkasında kullanılmalı. Direkt erişimde spoofing mümkün.

---

## Teslim Kriterleri

- [ ] `GET /api/p/:username` çalışıyor — ilk istekte DB sorgusu var, sonrasında Redis'ten geliyor
- [ ] Redis cache 60 saniye TTL sonra otomatik expire oluyor
- [ ] Profil gizliyse 404 dönüyor (`PROFILE_NOT_FOUND`)
- [ ] Profil bulunamıyorsa 404 dönüyor
- [ ] Zamanı gelmemiş linkler response'da görünmüyor (`startsAt` kontrolü)
- [ ] Süresi geçmiş linkler response'da görünmüyor (`endsAt` kontrolü)
- [ ] clickLimit dolan linkler response'da görünmüyor
- [ ] Şifreli linkin `url` ve `metadata` alanları `null` — `hasPassword: true`
- [ ] `POST /api/p/r/:linkId` doğru token ile URL döndürüyor
- [ ] `POST /api/p/r/:linkId` hatalı token ile 401 döndürüyor
- [ ] `POST /api/p/r/:linkId` süresi dolmuş linke 410 döndürüyor
- [ ] Tıklama kaydı Redis buffer'a ekleniyor (ülke, cihaz, referrer dahil)
- [ ] `POST /api/p/:username/view` görüntüleme kaydediyor
- [ ] Profil güncelleme sonrası Redis cache temizleniyor
- [ ] Link ekleme/silme/güncelleme sonrası Redis cache temizleniyor
- [ ] Response'da `Cache-Control` header'ı mevcut
