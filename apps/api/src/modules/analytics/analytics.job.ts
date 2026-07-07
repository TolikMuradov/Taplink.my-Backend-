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

  // Node kapanırken son flush — veri kaybını minimuma indir
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
