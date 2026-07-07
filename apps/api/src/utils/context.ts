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
      user: { select: { plan: true, planExpiresAt: true } },
    },
  })
  if (!profile) return null

  // Effective plan: abonelik iptal edilip dönemi de geçmişse PRO/BUSINESS → FREE.
  // (Webhook plan'ı zaten günceller ama bu, kaçan webhook'a karşı güvenlik ağı.)
  const { plan, planExpiresAt } = profile.user
  const isExpired = planExpiresAt != null && planExpiresAt < new Date()
  const effectivePlan: Plan = plan !== 'FREE' && isExpired ? 'FREE' : plan

  return { profileId: profile.id, plan: effectivePlan }
}
