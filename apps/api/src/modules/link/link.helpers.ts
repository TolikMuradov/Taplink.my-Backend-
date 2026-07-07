import { z } from 'zod'
import {
  LinkBasicMetaSchema, LinkMusicMetaSchema, LinkBookMetaSchema,
  LinkVideoMetaSchema, LinkProductMetaSchema, SocialMetaSchema,
  HeaderMetaSchema, DividerMetaSchema, EmbedMetaSchema,
  ImageMetaSchema, MapMetaSchema, FaqMetaSchema,
  ContactFormMetaSchema, CollectionMetaSchema,
  EmailCaptureMetaSchema, ContactDetailsMetaSchema, SocialProofMetaSchema,
  ErrorCodes,
} from '@taplink/validations'

// Block tipine + card stiline göre doğru metadata şemasını seçer
// "late binding validation" — tip belli olunca doğru validator devreye girer
export function getMetadataSchema(
  type: string,
  cardStyle?: string | null
): z.ZodTypeAny | null {
  switch (type) {
    case 'LINK':
      switch (cardStyle) {
        case 'music':   return LinkMusicMetaSchema
        case 'book':    return LinkBookMetaSchema
        case 'video':   return LinkVideoMetaSchema
        case 'product': return LinkProductMetaSchema
        default:        return LinkBasicMetaSchema  // 'basic' ve diğerleri
      }
    case 'SOCIAL':           return SocialMetaSchema
    case 'HEADER':           return HeaderMetaSchema
    case 'DIVIDER':          return DividerMetaSchema
    case 'EMBED':            return EmbedMetaSchema
    case 'IMAGE':            return ImageMetaSchema
    case 'MAP':              return MapMetaSchema
    case 'FAQ':              return FaqMetaSchema
    case 'CONTACT_FORM':     return ContactFormMetaSchema
    case 'COLLECTION':       return CollectionMetaSchema
    case 'EMAIL_CAPTURE':    return EmailCaptureMetaSchema
    case 'CONTACT_DETAILS':  return ContactDetailsMetaSchema
    case 'SOCIAL_PROOF':     return SocialProofMetaSchema
    default:                 return null
  }
}

// Metadata'yı tipine göre parse eder — hata varsa error kodu üretir
export function parseMetadata(
  type: string,
  cardStyle: string | null | undefined,
  rawMetadata: unknown
): { data: unknown; error: string | null } {
  const schema = getMetadataSchema(type, cardStyle)
  if (!schema) {
    return { data: null, error: ErrorCodes.VALIDATION_ERROR }
  }
  if (!rawMetadata) {
    return { data: null, error: null }  // metadata opsiyonel
  }

  const result = schema.safeParse(rawMetadata)
  if (!result.success) {
    return { data: null, error: ErrorCodes.VALIDATION_ERROR }
  }
  return { data: result.data, error: null }
}

// PRO gerektiren card stilleri
export const PRO_CARD_STYLES = new Set(['music', 'book', 'video', 'product'])

// PRO gerektiren block tipleri
// CONTACT_DETAILS ve SOCIAL_PROOF → FREE (herkes kullanabilir)
export const PRO_BLOCK_TYPES = new Set([
  'IMAGE', 'MAP', 'FAQ', 'CONTACT_FORM', 'EMAIL_CAPTURE', 'COLLECTION',
])

// Bu block'u oluşturmak/güncellemek için PRO gerekiyor mu?
export function requiresProPlan(type: string, cardStyle?: string | null): boolean {
  if (PRO_BLOCK_TYPES.has(type)) return true
  if (type === 'LINK' && cardStyle && PRO_CARD_STYLES.has(cardStyle)) return true
  return false
}

// Zaman bazlı link kontrolü — ziyaretçi görünümünde de kullanılır (Step 09)
export function checkLinkSchedule(
  isActive: boolean,
  startsAt: Date | null,
  endsAt: Date | null
): { visible: boolean; reason: string | null } {
  if (!isActive) return { visible: false, reason: 'inactive' }

  const now = new Date()
  if (startsAt && now < startsAt) return { visible: false, reason: ErrorCodes.LINK_NOT_SCHEDULED }
  if (endsAt && now > endsAt)     return { visible: false, reason: ErrorCodes.LINK_EXPIRED }

  return { visible: true, reason: null }
}
