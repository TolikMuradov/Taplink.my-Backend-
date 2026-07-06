# Step 08 — Analytics

**Bağımlılık:** Step 01–05 tamamlanmış olmalı. Step 06 (link modülü) ve Step 09 (public profil API) bu step ile birlikte çalışır — tıklama olayları Step 09'da tetiklenir, burada işlenir.  
**Sonraki Step:** Step 09 (Public profil API) bu step'teki `recordClick()` fonksiyonunu çağırır.

---

## Amaç

Ziyaretçi tıklamalarını ve profil görüntülemelerini kaydetmek, profil sahiplerine analitik göstermek. Bu step bittiğinde:

- Ziyaretçi bir profil açınca görüntüleme sayılır (Redis)
- Ziyaretçi bir linke tıklayınca tıklama sayılır (Redis)
- Redis buffer'daki veriler her 5 dakikada bir PostgreSQL'e yazılır
- Profil sahibi kendi analitiğini sorgulayabilir

---

## Free vs PRO — Analitik Farkı

> Linktree Free'de sadece toplam tıklama sayısı var. Biz Free'de daha fazlasını sunuyoruz — ama PRO için anlamlı bir fark bırakıyoruz.

| Özellik | Linktree Free | **Taplink.my Free** | **Taplink.my PRO** |
|---|---|---|---|
| Toplam tıklama | ✅ | ✅ | ✅ |
| Günlük grafik | ❌ | ✅ **← Linktree'den iyi** | ✅ |
| Link bazlı tıklama | ❌ | ✅ **← Linktree'den iyi** | ✅ |
| Geçmiş derinliği | 7 gün | **30 gün** | **1 yıl** |
| Ülke breakdown | ❌ | ❌ | ✅ |
| Cihaz breakdown | ❌ | ❌ | ✅ |
| Referrer (trafik kaynağı) | ❌ | ❌ | ✅ |
| En iyi saatler | ❌ | ❌ | ✅ |

**Mantık:** Free kullanıcı "kaç kişi gördü, hangi linke ne kadar tıkladı, bu hafta nasıldı" sorularını cevaplayabiliyor — başlangıç için yeterli. PRO kullanıcı "ziyaretçilerim hangi ülkeden, hangi cihazda, hangi saatte geliyor, trafik kaynağım ne" sorularını cevaplayabiliyor — büyüyen hesaplar için değerli.

---

## Neden Bu Kararlar?

### Neden Redis buffer, doğrudan PostgreSQL yazmıyoruz?

1M Instagram takipçisi olan bir kullanıcının profili aynı anda 10k-50k ziyaretçi alabilir. Her tıklama için PostgreSQL'e `INSERT` yapsaydık:
- Saniyede yüzlerce yazma → DB bağlantı havuzu tükenir
- Latency artar → link yönlendirmesi yavaşlar (ziyaretçi beklenir)
- Maliyet patlar

Redis list'e yazmak mikrosaniye sürer. Birikiyor, 5 dakikada bir batch `INSERT` — PostgreSQL tek seferde onlarca kaydı halleder. Ziyaretçi hiçbir şey hissetmez.

### Neden HyperLogLog profil görüntüleme için?

Aynı ziyaretçi sayfayı 10 kez yenilerse 10 görüntüleme sayılmasın istiyoruz. HyperLogLog veri yapısı "bu IP'yi bugün gördüm mü?" sorusunu yanıtlar — tam liste tutmadan, çok az bellek kullanarak. %1 hata payı var ama analitik için yeterince doğru.

Tıklamalar HyperLogLog değil sayaç — aynı ziyaretçi aynı linke birden tıklayabilir, hepsi sayılmalı.

### Neden ülke/cihaz bilgisini kaydediyoruz ama Free'de göstermiyoruz?

Veriyi **her kullanıcı için** kaydediyoruz — Free veya PRO fark etmez. Kaydedilmezse PRO'ya geçince eski veri yok. Sadece sorgu endpoint'ini plan kilidiyle kısıtlıyoruz — veri var ama göstermiyoruz. Kullanıcı PRO'ya geçince tüm geçmiş anında görünür.

### Neden `createdAt` index'i var Click tablosunda?

Analitik sorguları her zaman tarih aralığı filtreler: "son 30 gün", "son 1 yıl". Index olmadan bu sorgu her sorguda tüm Click tablosunu tarar — yavaş ve maliyetli. Index ile logaritmik arama.

### Batch job neden Fastify içinde, ayrı process değil?

Basitlik için. Ayrı bir worker process (Redis Queue + Bull/BullMQ) daha sağlam ama Step 08 için fazla karmaşık. `setInterval` ile Fastify başladığında job başlar, kapanınca durur. İleride traffic büyüyünce ayrı worker'a taşınabilir — service katmanı aynı kalır.

---

## Gereksinimler

- Step 04 tamamlanmış (`requireAuth` middleware, Upstash Redis client)
- Step 02 tamamlanmış — `Click` modeli Prisma şemasında mevcut:
  ```prisma
  model Click {
    id        String   @id @default(cuid())
    profileId String
    linkId    String?
    country   String?
    device    String?   // "mobile" | "desktop" | "tablet"
    referrer  String?
    createdAt DateTime  @default(now())
    profile   Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
    link      Link?     @relation(fields: [linkId], references: [id], onDelete: SetNull)
    @@index([profileId, createdAt])
    @@index([linkId, createdAt])
  }
  ```
  > Eğer `Click` modelinde bu index'ler yoksa Step 02 şemasına ekle ve migration çalıştır:
  > ```bash
  > pnpm --filter @taplink/db db:migrate
  > ```

---

## Klasör Yapısı (Hedef)

```
apps/api/src/modules/analytics/
├── analytics.service.ts   ← Redis yazma, batch flush, sorgu fonksiyonları
├── analytics.routes.ts    ← HTTP endpoint'leri
└── analytics.job.ts       ← 5 dakikalık batch flush job'u
```

---

## Redis Key Yapısı

Tüm Redis key'lerinin ne anlama geldiği bir arada:

```
clicks:buffer                          → List<JSON>   — Flush bekleyen tıklama olayları
views:buffer                           → List<JSON>   — Flush bekleyen görüntüleme olayları
views:uniq:{profileId}:{YYYY-MM-DD}    → HyperLogLog  — Günlük tekil ziyaretçi (IP bazlı)
```

Key'lere ön ek olarak `taplink:` eklemek iyi pratik — Upstash'ta başka projelerin key'leriyle çakışmaz. Örnek: `taplink:clicks:buffer`.

---

## TODO

### Bölüm 8.1 — Analytics Service

- [ ] `apps/api/src/modules/analytics/analytics.service.ts` oluştur:
  ```typescript
  import { redis } from '../auth/auth.service'  // Step 04'te kurulan Upstash Redis client
  // NOT: Redis client'ı tek yerden import et — her modül kendi client'ını oluşturmasın.
  // Step 04'te `export const redis = new Redis(...)` yapıldıysa oradan al.
  // Yoksa bu dosyada oluştur ve ortak bir yere taşı (örn. src/lib/redis.ts).

  import { prisma } from '@taplink/db'

  // ─────────────────────────────────────────
  // TIP TANIMLAMALARI
  // ─────────────────────────────────────────

  type ClickEvent = {
    profileId: string
    linkId:    string | null
    country:   string | null   // IP'den çıkarılır (Step 09'da)
    device:    string | null   // User-Agent'tan çıkarılır (Step 09'da)
    referrer:  string | null   // Referer header'dan
    timestamp: number          // Date.now()
  }

  type ViewEvent = {
    profileId: string
    visitorIp: string          // HyperLogLog için — DB'ye yazılmaz
    timestamp: number
  }

  // ─────────────────────────────────────────
  // YAZMA — Step 09'dan çağrılır
  // ─────────────────────────────────────────

  // Tıklama olayını buffer'a ekle
  export async function recordClick(event: ClickEvent): Promise<void> {
    await redis.lpush(
      'taplink:clicks:buffer',
      JSON.stringify(event)
    )
  }

  // Profil görüntülemesini kaydet
  // HyperLogLog ile tekil ziyaretçi takibi — aynı IP günde 1 kez sayılır
  export async function recordView(event: ViewEvent): Promise<void> {
    const dateKey = new Date(event.timestamp).toISOString().slice(0, 10)  // "2024-01-15"

    await Promise.all([
      // Buffer'a ekle (günlük toplam için)
      redis.lpush('taplink:views:buffer', JSON.stringify(event)),
      // HyperLogLog — tekil ziyaretçi (IP bazlı, %1 hata payı)
      redis.pfadd(`taplink:views:uniq:${event.profileId}:${dateKey}`, event.visitorIp),
      // HyperLogLog key 48 saat sonra expire olur — artık gerekmiyor
      redis.expire(`taplink:views:uniq:${event.profileId}:${dateKey}`, 48 * 60 * 60),
    ])
  }

  // ─────────────────────────────────────────
  // BATCH FLUSH — analytics.job.ts tarafından her 5 dakikada çağrılır
  // ─────────────────────────────────────────

  export async function flushClicksToDb(): Promise<void> {
    // ─── ATOMIC RENAME YAKLAŞIMI ───────────────────────────────────────────
    // Sorun: lrange → del → createMany arasında sunucu çökerse:
    //   - lrange sonrası del öncesi çöküş → veri DB'ye girmez, Redis'te de silinir → kayıp
    //   - del sonrası yeni gelen tıklamalar yeni buffer'a gider, eski veri zaten yok → kayıp
    //
    // Çözüm: RENAME ile buffer'ı önce geçici bir isme taşı (atomik işlem).
    //   1. Yeni tıklamalar buffer'a yazmaya devam eder — işlem boyunca dokunulmaz.
    //   2. flush key'inden okuyoruz — yarıda kesilse bile veri flush key'inde durur.
    //   3. DB'ye yazınca flush key'i sil.
    //
    // Upstash persistence ile Redis restart'ında flush key'indeki veri kaybolmaz.
    // ───────────────────────────────────────────────────────────────────────

    const buffer = 'taplink:clicks:buffer'
    const flush  = 'taplink:clicks:flush'

    // Buffer'ı flush key'ine atomik olarak taşı
    // RENAME sadece buffer doluysa anlamlı — boşsa devam etme
    const bufferLen = await redis.llen(buffer)
    if (bufferLen === 0) return

    await redis.rename(buffer, flush)

    const raw = await redis.lrange(flush, 0, -1)
    if (raw.length === 0) {
      await redis.del(flush)
      return
    }

    const events: ClickEvent[] = raw
      .map(r => { try { return JSON.parse(r as string) } catch { return null } })
      .filter(Boolean)

    // Büyük batch'leri böl — tek seferde 1000'den fazla INSERT PostgreSQL'i zorlayabilir
    const BATCH_SIZE = 500
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const chunk = events.slice(i, i + BATCH_SIZE)
      await prisma.click.createMany({
        data: chunk.map(e => ({
          profileId: e.profileId,
          linkId:    e.linkId,
          country:   e.country,
          device:    e.device,
          referrer:  e.referrer,
          createdAt: new Date(e.timestamp),
        })),
        skipDuplicates: true,
      })
    }

    // DB'ye yazma başarılı — flush key'ini sil
    await redis.del(flush)
  }

  export async function flushViewsToDb(): Promise<void> {
    const buffer = 'taplink:views:buffer'
    const flush  = 'taplink:views:flush'

    const bufferLen = await redis.llen(buffer)
    if (bufferLen === 0) return

    await redis.rename(buffer, flush)

    // Görüntüleme olayları sadece sayım için — IP DB'ye yazılmaz (KVKK/GDPR)
    const raw = await redis.lrange(flush, 0, -1)
    if (raw.length === 0) {
      await redis.del(flush)
      return
    }

    const events: ViewEvent[] = raw
      .map(r => { try { return JSON.parse(r as string) } catch { return null } })
      .filter(Boolean)

    const BATCH_SIZE = 500
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const chunk = events.slice(i, i + BATCH_SIZE)
      await prisma.click.createMany({
        data: chunk.map(e => ({
          profileId: e.profileId,
          linkId:    null,    // null = profil görüntüleme, linkId var = link tıklaması
          country:   null,    // görüntülemede breakdown yok
          device:    null,
          referrer:  null,
          createdAt: new Date(e.timestamp),
        })),
        skipDuplicates: true,
      })
    }

    await redis.del(flush)
  }

  // ─────────────────────────────────────────
  // SORGU — analytics.routes.ts tarafından kullanılır
  // ─────────────────────────────────────────

  // Plan bazlı gün sınırı
  function getDayLimit(plan: string): number {
    return plan === 'FREE' ? 30 : 365
  }

  // Genel bakış: toplam görüntüleme + tıklama + günlük grafik
  // FREE ve PRO — fark sadece geçmiş derinliği
  export async function getOverview(profileId: string, plan: string) {
    const days  = getDayLimit(plan)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [totalViews, totalClicks, daily] = await Promise.all([
      // Toplam görüntüleme (linkId = null)
      prisma.click.count({
        where: { profileId, linkId: null, createdAt: { gte: since } },
      }),
      // Toplam tıklama (linkId dolu)
      prisma.click.count({
        where: { profileId, linkId: { not: null }, createdAt: { gte: since } },
      }),
      // Günlük breakdown — ham veri, service'te gruplar
      prisma.click.findMany({
        where:   { profileId, createdAt: { gte: since } },
        select:  { createdAt: true, linkId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    // Günlük gruplama — JavaScript'te yapılır (DB'de GROUP BY yerine)
    // Nedeni: Neon serverless bağlantısı GROUP BY sorgularında extra latency ekleyebilir
    // Bu boyutta veri (30 gün × max 50k tıklama) için JS gruplama daha hızlı
    const byDay: Record<string, { views: number; clicks: number }> = {}

    for (const row of daily) {
      const date = row.createdAt.toISOString().slice(0, 10)
      if (!byDay[date]) byDay[date] = { views: 0, clicks: 0 }
      if (row.linkId) byDay[date].clicks++
      else            byDay[date].views++
    }

    return {
      totalViews,
      totalClicks,
      periodDays: days,
      daily: Object.entries(byDay).map(([date, counts]) => ({ date, ...counts })),
    }
  }

  // Link bazlı tıklama sayıları — FREE ve PRO
  export async function getLinkStats(profileId: string, plan: string) {
    const since = new Date(Date.now() - getDayLimit(plan) * 24 * 60 * 60 * 1000)

    const clicks = await prisma.click.groupBy({
      by:    ['linkId'],
      where: { profileId, linkId: { not: null }, createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    })

    const total = clicks.reduce((sum, r) => sum + r._count.id, 0)

    return clicks.map(r => ({
      linkId:     r.linkId,
      clicks:     r._count.id,
      percentage: total > 0 ? Math.round((r._count.id / total) * 100) : 0,
    }))
  }

  // Ülke, cihaz, referrer breakdown — SADECE PRO
  export async function getBreakdown(profileId: string) {
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)

    const [byCountry, byDevice, byReferrer, byHour] = await Promise.all([
      // Ülke
      prisma.click.groupBy({
        by:    ['country'],
        where: { profileId, linkId: { not: null }, createdAt: { gte: since }, country: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take:  20,
      }),
      // Cihaz
      prisma.click.groupBy({
        by:    ['device'],
        where: { profileId, linkId: { not: null }, createdAt: { gte: since }, device: { not: null } },
        _count: { id: true },
      }),
      // Referrer (trafik kaynağı)
      prisma.click.groupBy({
        by:    ['referrer'],
        where: { profileId, linkId: { not: null }, createdAt: { gte: since }, referrer: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take:  10,
      }),
      // Saatlik dağılım — günün hangi saatinde zirve?
      prisma.$queryRaw<{ hour: number; clicks: bigint }[]>`
        SELECT EXTRACT(HOUR FROM "createdAt") as hour, COUNT(*) as clicks
        FROM "Click"
        WHERE "profileId" = ${profileId}
          AND "linkId" IS NOT NULL
          AND "createdAt" >= ${since}
        GROUP BY hour
        ORDER BY hour
      `,
    ])

    return {
      byCountry:  byCountry.map(r  => ({ country:  r.country,  clicks: r._count.id })),
      byDevice:   byDevice.map(r   => ({ device:   r.device,   clicks: r._count.id })),
      byReferrer: byReferrer.map(r => ({ referrer: r.referrer, clicks: r._count.id })),
      byHour:     byHour.map(r     => ({ hour: Number(r.hour), clicks: Number(r.clicks) })),
    }
  }
  ```

### Bölüm 8.2 — Batch Job

- [ ] `apps/api/src/modules/analytics/analytics.job.ts` oluştur:
  ```typescript
  import { flushClicksToDb, flushViewsToDb } from './analytics.service'

  const FLUSH_INTERVAL_MS = 5 * 60 * 1000  // 5 dakika

  let jobTimer: NodeJS.Timeout | null = null

  export function startAnalyticsJob(): void {
    if (jobTimer) return  // Zaten çalışıyor

    console.log('[Analytics] Batch flush job başlatıldı (5 dakikada bir)')

    jobTimer = setInterval(async () => {
      try {
        await flushClicksToDb()
        await flushViewsToDb()
      } catch (err) {
        // Job hatası tüm uygulamayı çökertmemeli
        console.error('[Analytics] Flush hatası:', err)
      }
    }, FLUSH_INTERVAL_MS)

    // Node.js kapanırken son flush — veri kaybını minimuma indir
    process.once('SIGTERM', async () => {
      if (jobTimer) clearInterval(jobTimer)
      console.log('[Analytics] Kapanış öncesi son flush...')
      await flushClicksToDb().catch(console.error)
      await flushViewsToDb().catch(console.error)
    })
  }

  export function stopAnalyticsJob(): void {
    if (jobTimer) {
      clearInterval(jobTimer)
      jobTimer = null
    }
  }
  ```

### Bölüm 8.3 — Analytics Routes

- [ ] `apps/api/src/modules/analytics/analytics.routes.ts` oluştur:
  ```typescript
  import { FastifyInstance } from 'fastify'
  import { requireAuth }     from '../auth/auth.middleware'
  import { requirePlan }     from '../../utils/plan'
  import { getOverview, getLinkStats, getBreakdown } from './analytics.service'

  export async function analyticsRoutes(fastify: FastifyInstance) {

    // ─────────────────────────────────────────
    // GET /api/analytics/overview
    // Toplam görüntüleme, tıklama, günlük grafik
    // FREE: 30 gün | PRO: 365 gün
    // ─────────────────────────────────────────
    fastify.get('/api/analytics/overview', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user = req.user!
      const data = await getOverview(user.profileId, user.plan)
      return reply.send({ success: true, data })
    })

    // ─────────────────────────────────────────
    // GET /api/analytics/links
    // Her linkin tıklama sayısı ve yüzdesi
    // FREE: 30 gün | PRO: 365 gün
    // ─────────────────────────────────────────
    fastify.get('/api/analytics/links', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user = req.user!
      const data = await getLinkStats(user.profileId, user.plan)
      return reply.send({ success: true, data })
    })

    // ─────────────────────────────────────────
    // GET /api/analytics/breakdown
    // Ülke, cihaz, referrer, saatlik dağılım
    // SADECE PRO — Free kullanıcıya 403 döner
    // ─────────────────────────────────────────
    fastify.get('/api/analytics/breakdown', {
      preHandler: [requireAuth],
    }, async (req, reply) => {
      const user = req.user!

      // Plan kontrolü — Free kullanıcı bu endpoint'e erişemez
      if (requirePlan(user.plan, 'PRO', reply)) return

      const data = await getBreakdown(user.profileId)
      return reply.send({ success: true, data })
    })
  }
  ```

### Bölüm 8.4 — Ana Uygulamaya Bağla

- [ ] `apps/api/src/app.ts` (veya `index.ts`) içine ekle:
  ```typescript
  import { analyticsRoutes } from './modules/analytics/analytics.routes'
  import { startAnalyticsJob } from './modules/analytics/analytics.job'

  app.register(analyticsRoutes)

  // Uygulama hazır olunca job'u başlat
  app.ready(() => {
    startAnalyticsJob()
  })
  ```

### Bölüm 8.5 — Step 06 Link Service Güncellemesi (Küçük Ek)

Step 07'de card görsel yükleme sonrası eski görselin silinmemesi sorununu ve click sayacını burada çözüyoruz.

- [ ] `apps/api/src/modules/link/link.service.ts` içindeki `updateLink` fonksiyonuna ekle:
  ```typescript
  // updateLink fonksiyonu içinde, link güncellendikten sonra:
  // Eğer metadata.imageUrl değişti ve eski URL R2'deyse eski görseli sil
  import { deleteFromR2 } from '../upload/upload.service'

  // link.service.ts → updateLink → en sonuna ekle:
  const oldMeta = existing.metadata as any
  const newMeta = parsedMeta as any
  if (
    oldMeta?.imageUrl &&
    newMeta?.imageUrl &&
    oldMeta.imageUrl !== newMeta.imageUrl &&
    oldMeta.imageUrl.includes(process.env.R2_PUBLIC_URL ?? '')
  ) {
    await deleteFromR2(oldMeta.imageUrl)  // sessiz hata — silme başarısız olsa da devam
  }
  ```

---

## Frontend için Not (Bilgi Amaçlı)

> Analytics dashboard frontend'de nasıl gösterilir — bu step değil ama developer bilmeli:

```
Free kullanıcı dashboard:
  ├── Toplam görüntüleme (son 30 gün)
  ├── Toplam tıklama (son 30 gün)
  ├── Günlük grafik (çizgi/bar chart)
  └── Link sıralaması (en çok tıklanan üstte)
      └── [PRO'ya geç → ülke/cihaz/referrer görmek için]  ← dönüşüm noktası

PRO kullanıcı dashboard:
  ├── Toplam görüntüleme (son 365 gün)
  ├── Toplam tıklama (son 365 gün)
  ├── Günlük grafik (1 yıl)
  ├── Link sıralaması
  ├── Ülke haritası / sıralama
  ├── Cihaz dağılımı (mobil/masaüstü/tablet)
  ├── Trafik kaynakları (Instagram, TikTok, direkt...)
  └── Günün saatlerine göre zirve grafiği
```

---

## Debug Notları

**Analytics verisi gelmiyor, endpoint 200 dönüyor ama `daily: []`**
→ Batch job henüz çalışmadı veya hiç tıklama olmadı.
→ Redis'te `taplink:clicks:buffer` key'ini kontrol et: `redis.lrange('taplink:clicks:buffer', 0, -1)`
→ `flushClicksToDb()` fonksiyonunu manuel tetikle: route'a test endpoint ekle veya doğrudan çağır.

**"Cannot read property 'lpush' of undefined"**
→ `redis` client import edilemiyor — Step 04'te oluşturulan client'ın export edildiğini doğrula.
→ Upstash Redis bağlantı URL'si `.env`'de mevcut mu kontrol et.

**`prisma.click.createMany` çalışmıyor**
→ `Click` modeli `packages/db/prisma/schema.prisma`'da tanımlı mı? Step 02'yi kontrol et.
→ `@@index([profileId, createdAt])` index'i yoksa migration çalıştır.

**Breakdown endpoint'i PRO kullanıcıda bile boş dönüyor**
→ Click tablosunda `country` ve `device` alanları null — Step 09'da bu alanların doldurulması lazım.
→ Step 09 (public profil API) yazılmadan country/device verisi gelmez — bu beklenen durum.

**`getBreakdown` içindeki `$queryRaw` TypeScript hatası**
→ `prisma.$queryRaw` template literal kullanır — backtick ile yazılmalı.
→ `bigint` return tipi: `Number(r.clicks)` ile dönüştür — JSON'da bigint serialize edilemez.

**Job çalışıyor ama her flush'ta hata**
→ `console.error('[Analytics] Flush hatası:', err)` çıktısına bak — Prisma bağlantı sorunu veya Redis bağlantı sorunu olabilir.
→ Job hatası uygulamayı çökertmez (try/catch) — ama veri kaybı yaşanır.

---

## Güvenlik Notları

- Ziyaretçi IP'si **asla DB'ye yazılmaz** — sadece HyperLogLog'a eklenir, anonim kalır. GDPR/KVKK uyumu.
- Referrer header temizlenmeli — çok uzun string gelirse truncate et (max 200 karakter).
- Analytics endpoint'leri `requireAuth` ile korunuyor — başka kullanıcının analitiği görülemez.
- `profileId` her sorguda `WHERE` koşulunda — ID tahmin ederek başka kullanıcının verisine erişilemez.

---

## Teslim Kriterleri

- [ ] `GET /api/analytics/overview` çalışıyor — Free kullanıcıya 30 gün, PRO'ya 365 gün veri dönüyor
- [ ] `GET /api/analytics/links` çalışıyor — link bazlı tıklama sayıları ve yüzdesi dönüyor
- [ ] `GET /api/analytics/breakdown` Free kullanıcıya `403 SUBSCRIPTION_REQUIRED` dönüyor
- [ ] `GET /api/analytics/breakdown` PRO kullanıcıya ülke/cihaz/referrer/saat verisi dönüyor
- [ ] `recordClick()` çağrılınca Redis'te `taplink:clicks:buffer` key'ine veri ekleniyor
- [ ] Batch job 5 dakikada bir çalışıyor, Redis buffer'ı PostgreSQL'e yazıyor
- [ ] Uygulama SIGTERM alınca son flush yapılıyor (veri kaybı yok)
- [ ] IP adresi hiçbir DB kaydında görünmüyor
- [ ] Başka kullanıcının analitik endpoint'leri 401 veya 404 dönüyor
