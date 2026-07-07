import { redis } from '../../lib/redis'   // paylaşımlı Upstash client (Step 04)
import { prisma } from '@taplink/db'

// ─────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────

type ClickEvent = {
  profileId: string
  linkId:    string | null
  country:   string | null   // Step 09'da IP'den
  device:    string | null   // Step 09'da User-Agent'tan
  referrer:  string | null
  timestamp: number
}

type ViewEvent = {
  profileId: string
  visitorIp: string          // HyperLogLog için — DB'ye yazılmaz
  timestamp: number
}

// @upstash/redis değerleri otomatik JSON serialize/deserialize eder.
// Bu yüzden objeyi DOĞRUDAN lpush ediyoruz (manuel JSON.stringify YOK — yoksa
// çift serialize olur ve okumada JSON.parse patlar → hiçbir kayıt flush olmaz).
function parseEvents<T>(raw: unknown[]): T[] {
  return raw
    .map((r) => {
      try { return typeof r === 'string' ? JSON.parse(r) : r } catch { return null }
    })
    .filter(Boolean) as T[]
}

// ─────────────────────────────────────────
// YAZMA — Step 09'dan çağrılır
// ─────────────────────────────────────────

export async function recordClick(event: ClickEvent): Promise<void> {
  await redis.lpush('taplink:clicks:buffer', event)
}

export async function recordView(event: ViewEvent): Promise<void> {
  const dateKey = new Date(event.timestamp).toISOString().slice(0, 10)  // "2026-07-07"
  await Promise.all([
    redis.lpush('taplink:views:buffer', event),
    // HyperLogLog — tekil ziyaretçi (IP bazlı, %1 hata payı)
    redis.pfadd(`taplink:views:uniq:${event.profileId}:${dateKey}`, event.visitorIp),
    redis.expire(`taplink:views:uniq:${event.profileId}:${dateKey}`, 48 * 60 * 60),
  ])
}

// ─────────────────────────────────────────
// BATCH FLUSH — analytics.job her 5 dakikada çağırır
// Atomic RENAME: buffer'ı :flush'a taşı, oradan oku, DB'ye yaz, sil.
// Çökme durumunda veri :flush'ta kalır (kayıp olmaz).
// ─────────────────────────────────────────

export async function flushClicksToDb(): Promise<void> {
  const buffer = 'taplink:clicks:buffer'
  const flush  = 'taplink:clicks:flush'

  const bufferLen = await redis.llen(buffer)
  if (bufferLen === 0) return

  await redis.rename(buffer, flush)

  const raw = await redis.lrange(flush, 0, -1)
  if (raw.length === 0) { await redis.del(flush); return }

  const events = parseEvents<ClickEvent>(raw)

  const BATCH_SIZE = 500
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const chunk = events.slice(i, i + BATCH_SIZE)
    await prisma.click.createMany({
      data: chunk.map((e) => ({
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

  await redis.del(flush)
}

export async function flushViewsToDb(): Promise<void> {
  const buffer = 'taplink:views:buffer'
  const flush  = 'taplink:views:flush'

  const bufferLen = await redis.llen(buffer)
  if (bufferLen === 0) return

  await redis.rename(buffer, flush)

  const raw = await redis.lrange(flush, 0, -1)
  if (raw.length === 0) { await redis.del(flush); return }

  const events = parseEvents<ViewEvent>(raw)

  const BATCH_SIZE = 500
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const chunk = events.slice(i, i + BATCH_SIZE)
    // Görüntüleme: linkId=null (profil görüntüleme). IP DB'ye YAZILMAZ (GDPR/KVKK).
    await prisma.click.createMany({
      data: chunk.map((e) => ({
        profileId: e.profileId,
        linkId:    null,
        country:   null,
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
// SORGU
// ─────────────────────────────────────────

// Plan bazlı gün sınırı
function getDayLimit(plan: string): number {
  return plan === 'FREE' ? 30 : 365
}

// Genel bakış: toplam görüntüleme + tıklama + günlük grafik
export async function getOverview(profileId: string, plan: string) {
  const days  = getDayLimit(plan)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [totalViews, totalClicks, daily] = await Promise.all([
    prisma.click.count({
      where: { profileId, linkId: null, createdAt: { gte: since } },
    }),
    prisma.click.count({
      where: { profileId, linkId: { not: null }, createdAt: { gte: since } },
    }),
    prisma.click.findMany({
      where:   { profileId, createdAt: { gte: since } },
      select:  { createdAt: true, linkId: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  // Günlük gruplama — JS'te (bu boyutta veri için DB GROUP BY'dan hızlı)
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

  return clicks.map((r) => ({
    linkId:     r.linkId,
    clicks:     r._count.id,
    percentage: total > 0 ? Math.round((r._count.id / total) * 100) : 0,
  }))
}

// Ülke, cihaz, referrer, saat breakdown — SADECE PRO
export async function getBreakdown(profileId: string) {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)

  const [byCountry, byDevice, byReferrer, byHour] = await Promise.all([
    prisma.click.groupBy({
      by:    ['country'],
      where: { profileId, linkId: { not: null }, createdAt: { gte: since }, country: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take:  20,
    }),
    prisma.click.groupBy({
      by:    ['device'],
      where: { profileId, linkId: { not: null }, createdAt: { gte: since }, device: { not: null } },
      _count: { id: true },
    }),
    prisma.click.groupBy({
      by:    ['referrer'],
      where: { profileId, linkId: { not: null }, createdAt: { gte: since }, referrer: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take:  10,
    }),
    // Saatlik dağılım — ham SQL. NOT: tablo adı @@map ile "click" (küçük harf);
    // doküman "Click" yazıyordu, düzeltildi. Kolonlar camelCase quoted.
    prisma.$queryRaw<{ hour: number; clicks: bigint }[]>`
      SELECT EXTRACT(HOUR FROM "createdAt") as hour, COUNT(*) as clicks
      FROM "click"
      WHERE "profileId" = ${profileId}
        AND "linkId" IS NOT NULL
        AND "createdAt" >= ${since}
      GROUP BY hour
      ORDER BY hour
    `,
  ])

  return {
    byCountry:  byCountry.map((r)  => ({ country:  r.country,  clicks: r._count.id })),
    byDevice:   byDevice.map((r)   => ({ device:   r.device,   clicks: r._count.id })),
    byReferrer: byReferrer.map((r) => ({ referrer: r.referrer, clicks: r._count.id })),
    byHour:     byHour.map((r)     => ({ hour: Number(r.hour), clicks: Number(r.clicks) })),
  }
}
