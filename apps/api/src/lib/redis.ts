import { Redis } from '@upstash/redis'

// Projenin TEK paylaşımlı Redis client'ı.
// Step 08 (Analytics), Step 09 (Cache), Step 11 (Rate Limiting) buradan import eder.
// Her modül kendi client'ını oluşturmasın — tek bağlantı.

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error(
    'Upstash Redis env değişkenleri eksik: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN'
  )
}

export const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})
