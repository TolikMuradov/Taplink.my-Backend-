# Step 11 — Rate Limiting

**Bağımlılık:** Step 01–10 tamamlanmış olmalı. Upstash Redis Step 04'te kuruldu — bu step aynı bağlantıyı kullanır.  
**Sonraki Step:** Step 12 (Stripe). Bu step tamamlanmadan production'a çıkma.

> ⚠️ **Production öncesi zorunlu.** Rate limiting olmadan bot'lar dakikalar içinde sunucunu çökertebilir, spam formlarıyla veritabanını doldurabilir, brute-force ile hesaplara girebilir. Bu step'i atlamak doğrudan güvenlik açığıdır.

---

## Amaç

Her endpoint grubuna uygun hız sınırı koymak. Bu step bittiğinde:

- Auth endpoint'leri brute-force saldırılarına karşı korumalı
- Form endpoint'leri spam gönderimlerine karşı korumalı
- Tüm API genel limit altında
- Aşım durumunda `429 Too Many Requests` + `Retry-After` header döner
- Limit aşımları loglanır

---

## Neden Bu Kararlar?

### Neden merkezi bir yerde, her endpoint'te ayrı değil?

Step 04'te auth endpoint'lerine rate limiting eklendi — ama her modül kendi limiti eklerse:
- Aynı Redis key formatı 5 farklı yerde yazılır → tutarsızlık
- Limit değişince her modül ayrı güncellenir → bakım yükü
- Yeni endpoint ekleyince rate limit unutulur → güvenlik açığı

Bu step tek bir `rateLimit()` helper ve merkezi limit tablosu tanımlar. Yeni endpoint ekleyen developer sadece hangi gruba girdiğini seçer.

### Neden Upstash `@upstash/ratelimit`, başka kütüphane değil?

`@upstash/ratelimit` tam olarak Upstash Redis için tasarlanmış. Sliding window algoritmasını Lua script olarak Redis'in içinde çalıştırır — network round-trip minimumda, atom işlem garantisi var. `express-rate-limit` gibi in-memory kütüphaneler birden fazla sunucu instance'ında tutarsız çalışır.

### Sliding window neden fixed window'dan iyi?

Fixed window: "Bu dakikada 10 istek" → saldırgan 0:59'da 10, 1:00'da 10 istek atar = 2 saniyede 20 istek. Sınır delinir.

Sliding window: "Son 60 saniyede 10 istek" → zaman penceresi kayar, burst attack çalışmaz. Biraz daha pahalı ama kritik endpoint'lerde değer.

### Neden her endpoint grubu farklı limit?

```
Login: 5/15dk    — brute-force çok tehlikeli, düşük limit
Form:  3/5dk     — spam botu 1 saniyede 100 form atar, bu engeller
Genel: 100/dk    — normal kullanıcı zaten bu kadar atamaz
```

Herkese aynı limit koymak ya aşırı kısıtlayıcı (gerçek kullanıcı engellenir) ya da yetersiz (bot'u durduramaz) olur.

### Neden IP bazlı, kullanıcı bazlı değil?

- Login henüz başarısız — userId yok, sadece IP var
- Form endpoint'leri auth gerektirmiyor — userId yok
- Giriş yapmış kullanıcılar için `userId + endpoint` kombinasyonu daha adil ama karmaşıklık artar
- Şimdilik IP yeterli. Cloudflare arka planında gerçek IP `CF-Connecting-IP`'den alınır.

### Neden Step 04'teki auth rate limiting bu step'te tekrar yazılıyor?

Step 04'te elle, basitçe yazılmıştı. Bu step merkezi sisteme geçirir, tutarsızlıkları giderir, Step 04'teki eski rate limiting kodu kaldırılır.

---

## Gereksinimler

- Step 04 tamamlanmış (Upstash Redis client kurulu)
- `UPSTASH_REDIS_REST_URL` ve `UPSTASH_REDIS_REST_TOKEN` `.env`'de mevcut

---

## Klasör Yapısı (Hedef)

```
apps/api/src/plugins/
└── rate-limit.plugin.ts   ← Fastify plugin — tüm app'e register edilir

apps/api/src/lib/
└── rate-limit.ts          ← Yardımcı fonksiyonlar, limit grupları, helper
```

---

## TODO

### Bölüm 11.1 — Bağımlılığı Kur

- [ ] Paketi yükle:
  ```bash
  pnpm --filter @taplink/api add @upstash/ratelimit
  ```
  > `@upstash/redis` zaten Step 04'te yüklendi. `@upstash/ratelimit` sadece ek paket.

### Bölüm 11.2 — Limit Grupları ve Helper

- [ ] `apps/api/src/lib/rate-limit.ts` oluştur:
  ```typescript
  import { Ratelimit }              from '@upstash/ratelimit'
  import { redis }                  from '../lib/redis'   // Step 04'te oluşturulan paylaşımlı client
  import { FastifyRequest, FastifyReply } from 'fastify'
  // ⚠️ Yeni Redis() açma — src/lib/redis.ts'teki tekil instance kullanılıyor

  // redis'i de export et — route handler'larında per-link DoS koruması için kullanılır
  export { redis }

  // ─────────────────────────────────────────
  // LİMİT GRUPLARI
  // Her grup bir endpoint kategorisini temsil eder.
  // Yeni endpoint: mevcut gruba ekle veya yeni grup aç.
  // ─────────────────────────────────────────

  export const limiters = {

    // AUTH — brute-force koruması
    // Login, şifre sıfırlama gibi kritik endpoint'ler
    auth: new Ratelimit({
      redis,
      limiter:  Ratelimit.slidingWindow(5, '15m'),
      prefix:   'taplink:rl:auth',
      analytics: true,
    }),

    // REGISTER — kayıt spam koruması
    // Ayrı grup çünkü login'den daha uzun pencere
    register: new Ratelimit({
      redis,
      limiter:  Ratelimit.slidingWindow(3, '1h'),
      prefix:   'taplink:rl:register',
      analytics: true,
    }),

    // FORM — contact form ve email capture spam koruması
    // En kritik: bot saniyede yüzlerce form gönderebilir
    form: new Ratelimit({
      redis,
      limiter:  Ratelimit.slidingWindow(3, '5m'),
      prefix:   'taplink:rl:form',
      analytics: true,
    }),

    // UPLOAD — dosya yükleme kötüye kullanım koruması
    // R2 storage maliyetini kontrol altında tutar
    upload: new Ratelimit({
      redis,
      limiter:  Ratelimit.slidingWindow(10, '1h'),
      prefix:   'taplink:rl:upload',
      analytics: true,
    }),

    // PUBLIC — public profil görüntüleme ve link tıklama
    // Yüksek limit: gerçek ziyaretçiler çok istek atabilir
    // Bot koruması için yine de limit var
    public: new Ratelimit({
      redis,
      limiter:  Ratelimit.slidingWindow(120, '1m'),
      prefix:   'taplink:rl:public',
      analytics: true,
    }),

    // GENERAL — giriş yapmış kullanıcıların tüm istekleri
    // Normal dashboard kullanımı için yeterli
    general: new Ratelimit({
      redis,
      limiter:  Ratelimit.slidingWindow(100, '1m'),
      prefix:   'taplink:rl:general',
      analytics: true,
    }),

  } as const

  export type LimiterKey = keyof typeof limiters

  // ─────────────────────────────────────────
  // ZİYARETÇİ IP — Step 09'daki helper ile aynı mantık
  // Tek yerde tutmak için burada tekrar tanımlanıyor
  // (ortak helper'a taşınabilir: src/lib/ip.ts)
  // ─────────────────────────────────────────
  function getIp(req: FastifyRequest): string {
    const cfIp = req.headers['cf-connecting-ip']
    if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp

    const forwarded = req.headers['x-forwarded-for']
    if (forwarded) {
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
      return first.split(',')[0].trim()
    }

    return req.socket.remoteAddress ?? 'unknown'
  }

  // ─────────────────────────────────────────
  // ANA YARDIMCI — route handler içinde kullanılır
  //
  // Kullanım:
  //   const blocked = await checkRateLimit(req, reply, 'form')
  //   if (blocked) return   // ← reply zaten gönderildi, return yeterli
  //
  // ─────────────────────────────────────────
  export async function checkRateLimit(
    req:    FastifyRequest,
    reply:  FastifyReply,
    group:  LimiterKey,
    // Giriş yapmış kullanıcı varsa userId ile limit — IP'den daha adil
    identifier?: string
  ): Promise<boolean> {
    const id      = identifier ?? getIp(req)
    const limiter = limiters[group]

    const { success, limit, remaining, reset } = await limiter.limit(id)

    // Her response'a bilgilendirici header ekle (isteğe bağlı ama iyi pratik)
    reply.header('X-RateLimit-Limit',     String(limit))
    reply.header('X-RateLimit-Remaining', String(remaining))
    reply.header('X-RateLimit-Reset',     String(reset))

    if (!success) {
      const retryAfterSec = Math.ceil((reset - Date.now()) / 1000)
      reply.header('Retry-After', String(retryAfterSec))

      reply.status(429).send({
        success: false,
        code:    'TOO_MANY_REQUESTS',
        message: `Çok fazla istek. ${retryAfterSec} saniye sonra tekrar deneyin.`,
      })

      // İsteğe bağlı log — production'da Axiom/Sentry'e gönderilebilir
      console.warn(`[RateLimit] ${group} limit aşıldı — id: ${id}, path: ${req.url}`)

      return true  // "engellenidi" — handler return etmeli
    }

    return false  // devam et
  }
  ```

### Bölüm 11.3 — Fastify Plugin (Global Limit)

Giriş yapmış kullanıcıların tüm isteklerini `general` grubu altında otomatik sınırlar. Route bazlı limitler bu plugin'in üstüne eklenir.

- [ ] `apps/api/src/plugins/rate-limit.plugin.ts` oluştur:
  ```typescript
  import fp                from 'fastify-plugin'
  import { FastifyInstance } from 'fastify'
  import { checkRateLimit } from '../lib/rate-limit'

  // fastify-plugin: decorator'ların üst scope'a yayılması için
  // pnpm --filter @taplink/api add fastify-plugin
  
  async function rateLimitPlugin(fastify: FastifyInstance) {
    fastify.addHook('onRequest', async (req, reply) => {
      // Public endpoint'leri global limiten muaf tut —
      // onlar kendi özel limitlerini route içinde kontrol eder
      const publicPaths = ['/api/p/', '/api/health']
      const isPublic = publicPaths.some(p => req.url.startsWith(p))
      if (isPublic) return

      // Auth endpoint'leri kendi limitlerini kullanır
      const isAuth = req.url.startsWith('/api/auth/')
      if (isAuth) return

      // Giriş yapmış kullanıcı varsa userId ile limit
      // Yoksa IP ile (header veya session henüz parse edilmedi olabilir)
      const userId = (req as any).user?.id
      const blocked = await checkRateLimit(req, reply, 'general', userId)
      if (blocked) return reply  // hook'tan erken çık
    })
  }

  export default fp(rateLimitPlugin, { name: 'rate-limit' })
  ```

- [ ] `fastify-plugin` paketini kur:
  ```bash
  pnpm --filter @taplink/api add fastify-plugin
  ```

### Bölüm 11.4 — Ana Uygulamaya Bağla

- [ ] `apps/api/src/app.ts` içine plugin'i ekle — **diğer route kayıtlarından önce:**
  ```typescript
  import rateLimitPlugin from './plugins/rate-limit.plugin'

  // Route'lardan ÖNCE register et
  await app.register(rateLimitPlugin)

  // Sonra route'lar:
  // app.register(authRoutes)
  // app.register(linkRoutes)
  // ...
  ```

### Bölüm 11.5 — Endpoint Bazlı Limitler

Her endpoint'in kendi route handler'ına `checkRateLimit()` ekle. **Step 04'teki eski rate limit kodunu kaldır**, bunlarla değiştir.

#### Auth Endpoint'leri (`auth.routes.ts`)

- [ ] Login endpoint'ine ekle:
  ```typescript
  // POST /api/auth/sign-in/email
  fastify.post('/api/auth/sign-in/email', async (req, reply) => {
    const blocked = await checkRateLimit(req, reply, 'auth')
    if (blocked) return

    // ... mevcut login kodu
  })
  ```

- [ ] Register endpoint'ine ekle:
  ```typescript
  // POST /api/auth/sign-up/email
  fastify.post('/api/auth/sign-up/email', async (req, reply) => {
    const blocked = await checkRateLimit(req, reply, 'register')
    if (blocked) return

    // ... mevcut register kodu
  })
  ```

- [ ] Forgot password endpoint'ine ekle:
  ```typescript
  // POST /api/auth/forget-password
  fastify.post('/api/auth/forget-password', async (req, reply) => {
    const blocked = await checkRateLimit(req, reply, 'auth')
    if (blocked) return

    // ...
  })
  ```

#### Form Endpoint'leri (`forms.routes.ts`)

- [ ] Contact form endpoint'ine ekle:
  ```typescript
  // POST /api/p/forms/contact/:linkId
  fastify.post('/api/p/forms/contact/:linkId', async (req, reply) => {
    const blocked = await checkRateLimit(req, reply, 'form')
    if (blocked) return

    // ... mevcut form kodu
  })
  ```

- [ ] Email capture endpoint'ine ekle:
  ```typescript
  // POST /api/p/forms/subscribe/:linkId
  fastify.post('/api/p/forms/subscribe/:linkId', async (req, reply) => {
    const blocked = await checkRateLimit(req, reply, 'form')
    if (blocked) return

    // ...
  })
  ```

#### Upload Endpoint'leri (`upload.routes.ts`)

- [ ] Tüm upload endpoint'lerine ekle:
  ```typescript
  // POST /api/upload/avatar
  fastify.post('/api/upload/avatar', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    // Upload için userId ile limit — daha adil
    const blocked = await checkRateLimit(req, reply, 'upload', req.user!.id)
    if (blocked) return

    // ...
  })

  // POST /api/upload/background ve /api/upload/card-image de aynı şekilde
  ```

#### Public Endpoint'leri (`public.routes.ts`)

- [ ] Profil view endpoint'ine ekle:
  ```typescript
  // GET /api/p/:username
  fastify.get('/api/p/:username', async (req, reply) => {
    const blocked = await checkRateLimit(req, reply, 'public')
    if (blocked) return

    // ...
  })
  ```

- [ ] Link tıklama endpoint'ine ekle:
  ```typescript
  // POST /api/p/r/:linkId
  fastify.post('/api/p/r/:linkId', async (req, reply) => {
    // Katman 1: Genel public limiti (IP başına 120/dk)
    const blocked = await checkRateLimit(req, reply, 'public')
    if (blocked) return

    // Katman 2: clickLimit DoS koruması — IP + linkId başına sıkı limit
    // Neden gerekli: Bir bot IP başına 120/dk limiti aşmadan,
    // aynı linke dakikada 10 istek atarak clickLimit'i saniyeler içinde
    // tüketip o linki meşru kullanıcılara kapatabilir (Denial of Service).
    // Bu ikinci katman bunu önler.
    const { linkId } = req.params as { linkId: string }
    const ip = req.headers['cf-connecting-ip'] as string
      || (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
      || req.socket.remoteAddress
      || 'unknown'

    const clickKey = `taplink:rl:click:${linkId}:${ip}`
    // IP başına aynı link için 5 dakikada 10 tıklama — normal kullanımda bu yeter
    const clickCount = await redis.incr(clickKey)
    if (clickCount === 1) await redis.expire(clickKey, 300)  // 5 dakika TTL
    if (clickCount > 10) {
      return reply.status(429).send({
        success: false,
        code:    'TOO_MANY_REQUESTS',
        message: 'Bu linke çok fazla istek gönderildi.',
      })
    }

    // ...
  })
  ```

### Bölüm 11.6 — Health Check Endpoint (Rate Limit Dışı)

Monitoring araçlarının sık istek attığı health check endpoint'i rate limit'in dışında olmalı.

- [ ] `apps/api/src/app.ts` içine ekle:
  ```typescript
  // Rate limit plugin'den ÖNCE tanımla
  app.get('/api/health', async (req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() })
  })
  ```

---

## Limit Tablosu — Referans

Developer'ların eklediği yeni endpoint'leri hangi gruba koyacaklarını bilmeleri için:

| Endpoint Grubu | Limiter | Pencere | Kimlik |
|---|---|---|---|
| Login, şifre sıfırlama | `auth` | 5 istek / 15 dakika | IP |
| Kayıt | `register` | 3 istek / 1 saat | IP |
| Contact form, email capture | `form` | 3 istek / 5 dakika | IP |
| Dosya yükleme | `upload` | 10 istek / 1 saat | userId |
| Public profil, link tıklama | `public` | 120 istek / 1 dakika | IP |
| Dashboard (genel) | `general` | 100 istek / 1 dakika | userId |

**Yeni endpoint eklerken:** Yukarıdaki tabloda en uygun grubu seç. Hiçbirine uymuyorsa yeni grup aç.

---

## Debug Notları

**"@upstash/ratelimit not found" hatası**
→ `pnpm --filter @taplink/api add @upstash/ratelimit` çalıştırılmamış.
→ `pnpm install` çalıştırıp tekrar dene.

**Her istek 429 dönüyor, limit aşılmadı**
→ `UPSTASH_REDIS_REST_URL` veya `UPSTASH_REDIS_REST_TOKEN` yanlış — Ratelimit Redis'e bağlanamıyor, güvenli tarafta kalıp herkesi engelliyor.
→ Upstash dashboard'da token'ın aktif olduğunu doğrula.
→ `redis.ping()` ile bağlantıyı test et.

**Geliştirme ortamında sürekli 429 alıyorum**
→ Lokal geliştirmede sık sık yeniden yükleme olur, limit hızla dolar.
→ `.env` içine `DISABLE_RATE_LIMIT=true` ekle ve `checkRateLimit()` başına şunu ekle:
  ```typescript
  if (process.env.DISABLE_RATE_LIMIT === 'true') return false
  ```
→ **Production'da bu satırı bırakma.**

**`Retry-After` header'ı yanlış değer gösteriyor**
→ `reset` değeri Unix timestamp (milisaniye). `Date.now()` ile fark alırken birim uyumsuzluğuna dikkat.
→ `Math.ceil((reset - Date.now()) / 1000)` — milisaniyeyi saniyeye çevirir.

**Bot hala istek atıyor, rate limit çalışmıyor gibi**
→ IP spoofing: `X-Forwarded-For` header'ı taklit ediliyor olabilir. Production'da Cloudflare arkasında olunca `CF-Connecting-IP` güvenilir — onu kullan.
→ `getIp()` fonksiyonunun `cf-connecting-ip` önceliğini kontrol et.
→ Farklı IP'lerden gelen distributed bot için IP bazlı limit yetmez — Cloudflare WAF ve Turnstile (captcha) ek katman gerektirir (bu step kapsamı dışında).

**Global plugin çalışıyor ama belirli endpoint'in kendi limiti uygulanmıyor**
→ Plugin `onRequest` hook'ta çalışır, endpoint handler'ı `checkRateLimit()` sonrası çağrılır.
→ Handler içinde `if (blocked) return` yazıldığından emin ol — `return` olmadan kod devam eder.

**Rate limit analytics Upstash dashboard'da görünmüyor**
→ `analytics: true` Ratelimit constructor'ında tanımlı olmalı.
→ Upstash dashboard → Redis → Analytics sekmesini kontrol et.
→ Birkaç istek atmadan önce analytics veri göstermez.

---

## Güvenlik Notları

- `DISABLE_RATE_LIMIT=true` sadece `.env.development`'ta — asla production `.env`'inde.
- Rate limit anahtarı `taplink:rl:{group}:{identifier}` formatında — başka prefix'lerle çakışmaz.
- `analytics: true` aktif → Upstash dashboard'da hangi endpoint'in ne kadar istek aldığını görebilirsin. Production'da bot saldırı anında çok işe yarar.
- Global plugin sadece authenticated endpoint'lere uygulanıyor (public path'ler muaf). Bu doğru — public endpoint'lerin kendi limitleri var ve daha yüksek (120/dk).
- Cloudflare WAF bu limitlerden önce gelir. Gerçek DDoS trafiği Cloudflare'de bloklanır, sunucuya ulaşmaz. Rate limiting uygulama katmanında ikinci savunma hattı.
- Form endpoint'i için `form` limiti (3/5dk) sıkı görünebilir ama meşru kullanıcı 5 dakikada 3'ten fazla form doldurmaz. Doldurursa muhtemelen bot.

---

## Teslim Kriterleri

- [ ] `pnpm --filter @taplink/api add @upstash/ratelimit` hatasız çalışıyor
- [ ] `POST /api/auth/sign-in/email` 5 denemeden sonra 429 dönüyor, 15 dakika sonra sıfırlanıyor
- [ ] `POST /api/p/forms/contact/:linkId` 3 denemeden sonra 429 dönüyor
- [ ] `POST /api/p/forms/subscribe/:linkId` 3 denemeden sonra 429 dönüyor
- [ ] 429 response'unda `Retry-After` header'ı mevcut ve doğru saniye değeri içeriyor
- [ ] 429 response body'si `{ success: false, code: "TOO_MANY_REQUESTS" }` formatında
- [ ] `GET /api/health` endpoint'i rate limit'e takılmıyor
- [ ] Dashboard endpoint'leri (`/api/links`, `/api/profile` vb.) `general` grubu altında çalışıyor
- [ ] Upload endpoint'leri 10 yüklemeden sonra 429 dönüyor
- [ ] `DISABLE_RATE_LIMIT=true` ile geliştirme ortamında limit devre dışı
- [ ] Upstash dashboard'da `analytics: true` ile istek logları görünüyor
