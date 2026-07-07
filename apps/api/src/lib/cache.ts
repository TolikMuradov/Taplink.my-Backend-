import { redis } from './redis'          // aynı klasör — Step 04'teki paylaşımlı client
import { prisma } from '@taplink/db'

// Cache key formatı — tüm proje genelinde tutarlı olması için buradan üret
export function profileCacheKey(username: string): string {
  return `taplink:profile:${username.toLowerCase()}`
}

// Profil cache'ini sil. Çağrıldığı yerler:
//   - Profil güncelleme (profile.service)
//   - Link ekleme/güncelleme/silme/sıralama (link.service)
//   - Avatar/arkaplan yükleme/silme (upload.routes)
//   - Stripe plan değişimi (Step 12)
export async function invalidateProfileCache(username: string): Promise<void> {
  await redis.del(profileCacheKey(username))
  // NOT: Vercel ISR cache'ini de temizlemek için revalidatePath Next.js
  // tarafında yapılır. Backend sadece Redis'i temizler.
}

// profileId'den username bulup invalidate eder (link/analytics tarafı için)
export async function invalidateProfileCacheByProfileId(profileId: string): Promise<void> {
  const p = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { username: true },
  })
  if (p) await invalidateProfileCache(p.username)
}

// userId'den username bulup invalidate eder (profile/upload tarafı için)
export async function invalidateProfileCacheByUserId(userId: string): Promise<void> {
  const p = await prisma.profile.findUnique({
    where: { userId },
    select: { username: true },
  })
  if (p) await invalidateProfileCache(p.username)
}

// TTL sabitleri — tek yerden yönetilsin
export const CACHE_TTL = {
  profile: 60,        // saniye — public profil cache
  session: 60 * 60,  // 1 saat
} as const
