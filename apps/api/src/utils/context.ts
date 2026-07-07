import { prisma } from '@taplink/db'
import type { Plan } from '@taplink/db'

// ─────────────────────────────────────────────────────────────
// Better Auth session `user` nesnesinde profileId ve plan YOK
// (sadece id, name, email, emailVerified, image, createdAt, updatedAt).
// Dashboard route'ları (link, analytics, leads) profileId + plan'a ihtiyaç
// duyar — userId'den tek sorguda çekiyoruz. (Step 05 profil route'u da plan'ı
// böyle çekiyordu; burada tek yerde toparlıyoruz.)
//
// null döner: kullanıcının henüz profili yok (onboarding sinyali → 404).
// ─────────────────────────────────────────────────────────────
export async function getProfileContext(
  userId: string
): Promise<{ profileId: string; plan: Plan } | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      id: true,
      user: { select: { plan: true } },
    },
  })
  if (!profile) return null
  return { profileId: profile.id, plan: profile.user.plan }
}
