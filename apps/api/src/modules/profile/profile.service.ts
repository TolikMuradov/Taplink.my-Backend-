import { prisma } from '@taplink/db'
import { UpdateProfileInput, ErrorCodes } from '@taplink/validations'
import { DEFAULT_DESIGN, type DesignSettings } from '@taplink/types'
import { CURATED_TEMPLATES, isTemplateAvailableForPlan } from './profile.templates'
import { invalidateProfileCacheByUserId } from '../../lib/cache'

// Profili getir — kullanıcı ID'sine göre
export async function getProfileByUserId(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { userId },
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
      updatedAt:      true,
    },
  })

  return profile
}

// Plan bazlı designSettings doğrulama
// Döner: null = geçerli, {code, message} = hata
function validateDesignForPlan(
  design: DesignSettings,
  userPlan: string
): { code: string; message: string } | null {
  const isPro = userPlan === 'PRO' || userPlan === 'BUSINESS'

  // custom tip (elle özelleştirme) sadece PRO+
  if (design.type === 'custom' && !isPro) {
    return { code: ErrorCodes.SUBSCRIPTION_REQUIRED, message: 'Özel tasarım PRO plan gerektirir' }
  }

  // curated şablon — PRO şablonu FREE ile seçilemez
  if (design.type === 'curated' && design.templateId) {
    if (!isTemplateAvailableForPlan(design.templateId, userPlan)) {
      return { code: ErrorCodes.SUBSCRIPTION_REQUIRED, message: 'Bu şablon PRO plan gerektirir' }
    }
  }

  // Branding kaldırma — sadece PRO+
  if (design.footer?.showBranding === false && !isPro) {
    return { code: ErrorCodes.SUBSCRIPTION_REQUIRED, message: 'Taplink markasını kaldırmak PRO plan gerektirir' }
  }

  return null
}

// Profili güncelle
export async function updateProfile(
  userId: string,
  userPlan: string,
  data: UpdateProfileInput
): Promise<{ success: true } | { success: false; code: string; message: string }> {

  // designSettings varsa plan kontrolü yap
  if (data.designSettings) {
    const error = validateDesignForPlan(data.designSettings as DesignSettings, userPlan)
    if (error) return { success: false, ...error }

    // curated seçildiyse şablon listede var mı kontrol et
    if (data.designSettings.type === 'curated' && data.designSettings.templateId) {
      const templateExists = CURATED_TEMPLATES.some(t => t.id === data.designSettings!.templateId)
      if (!templateExists) {
        return { success: false, code: ErrorCodes.VALIDATION_ERROR, message: 'Geçersiz şablon ID' }
      }
    }
  }

  await prisma.profile.update({
    where: { userId },
    data: {
      ...(data.displayName    !== undefined && { displayName:    data.displayName }),
      ...(data.bio            !== undefined && { bio:            data.bio }),
      ...(data.designSettings !== undefined && { designSettings: data.designSettings as any }),
      ...(data.seoTitle       !== undefined && { seoTitle:       data.seoTitle }),
      ...(data.seoDescription !== undefined && { seoDescription: data.seoDescription }),
      ...(data.isPublic       !== undefined && { isPublic:       data.isPublic }),
    },
  })

  await invalidateProfileCacheByUserId(userId)   // public cache'i temizle
  return { success: true }
}

// Profili sıfırla — tüm özelleştirmeleri kaldır, varsayılan tasarıma döner
export async function resetProfile(userId: string) {
  await prisma.profile.update({
    where: { userId },
    data: {
      displayName:    null,
      bio:            null,
      avatarUrl:      null,
      backgroundUrl:  null,
      designSettings: DEFAULT_DESIGN as any,   // packages/types'dan gelen varsayılan
      seoTitle:       null,
      seoDescription: null,
    },
  })

  await invalidateProfileCacheByUserId(userId)
}
