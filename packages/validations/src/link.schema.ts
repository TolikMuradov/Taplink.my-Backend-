import { z } from 'zod'
import { BlockBackgroundSchema } from './design.schema'

// ─────────────────────────────────────────
// YARDIMCILAR
// ─────────────────────────────────────────

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/)

// Güvenli URL: sadece http/https — javascript: ve data: engellendi
const safeUrl = z
  .string()
  .url('Geçerli bir URL girin')
  .refine(
    (url) => url.startsWith('http://') || url.startsWith('https://'),
    'URL http:// veya https:// ile başlamalı'
  )

// ─────────────────────────────────────────
// BLOK TEMA OVERRIDE
// Her blok kendi görünümünü geçersiz kılabilir.
// Belirtilmeyen alanlar DesignSettings.blocks'tan devralınır.
// ─────────────────────────────────────────

export const BlockThemeOverrideSchema = z.object({
  style:           z.enum(['filled', 'outline', 'soft', 'shadow', 'blur']).optional(),
  shape:           z.enum(['pill', 'rounded', 'square']).optional(),
  background:      BlockBackgroundSchema.optional(),
  textColor:       hex.optional(),
  titleColor:      hex.optional(),
  borderColor:     hex.optional(),
  borderGradient:  z.object({ from: hex, to: hex, direction: z.string() }).optional(),
  shadowColor:     hex.optional(),
  iconPosition:    z.enum(['left', 'right', 'none']).optional(),
  shadow:          z.enum(['none', 'sm', 'md', 'lg']).optional(),
}).optional()

// ─────────────────────────────────────────
// BLOK TİPİ METADATA ŞEMALARI
// Her blok tipinin metadata alanı bu şemalardan biriyle doğrulanır.
// ─────────────────────────────────────────

// LINK — basic card
export const LinkBasicMetaSchema = z.object({
  iconType:     z.enum(['emoji', 'image', 'preset']).optional(),
  iconValue:    z.string().max(200).optional(),   // emoji, URL veya preset adı
  description:  z.string().max(200).optional(),   // card altında kısa açıklama
  thumbnailUrl: z.string().url().optional(),       // küçük önizleme görseli
  blockTheme:   BlockThemeOverrideSchema,
})

// LINK — music card
export const LinkMusicMetaSchema = z.object({
  imageUrl:   z.string().url().optional(),          // albüm kapağı
  artist:     z.string().max(100).optional(),
  album:      z.string().max(100).optional(),
  duration:   z.string().max(20).optional(),        // "3:45" formatı
  platform:   z.enum(['spotify', 'apple-music', 'youtube-music', 'soundcloud', 'other']).optional(),
  blockTheme: BlockThemeOverrideSchema,
})

// LINK — book card
export const LinkBookMetaSchema = z.object({
  imageUrl:    z.string().url().optional(),        // kapak görseli
  author:      z.string().max(100).optional(),
  description: z.string().max(300).optional(),
  genre:       z.string().max(50).optional(),
  blockTheme:  BlockThemeOverrideSchema,
})

// LINK — video card
export const LinkVideoMetaSchema = z.object({
  thumbnailUrl: z.string().url().optional(),
  channelName:  z.string().max(100).optional(),
  duration:     z.string().max(20).optional(),
  platform:     z.enum(['youtube', 'tiktok', 'instagram', 'vimeo', 'other']).optional(),
  blockTheme:   BlockThemeOverrideSchema,
})

// LINK — product card
export const LinkProductMetaSchema = z.object({
  imageUrl:      z.string().url().optional(),
  price:         z.number().min(0).optional(),
  originalPrice: z.number().min(0).optional(),     // indirim gösterimi için
  currency:      z.string().length(3).optional(),  // "THB", "USD", "IDR"
  blockTheme:    BlockThemeOverrideSchema,
})

// SOCIAL — sosyal medya ikonları satırı
export const SocialMetaSchema = z.object({
  platforms: z.array(z.object({
    platform: z.enum([
      'instagram', 'tiktok', 'youtube', 'twitter', 'facebook',
      'linkedin', 'pinterest', 'snapchat', 'whatsapp', 'telegram',
      'github', 'behance', 'dribbble', 'spotify', 'soundcloud',
      'twitch', 'discord', 'reddit', 'medium', 'threads',
    ]),
    url:         safeUrl,
    customLabel: z.string().max(30).optional(),
  })).min(1).max(20),
  iconStyle: z.enum(['filled', 'outline', 'minimal']).default('filled'),
  iconSize:  z.enum(['sm', 'md', 'lg']).default('md'),
  layout:    z.enum(['row', 'grid']).default('row'),
})

// HEADER — bölüm başlığı
export const HeaderMetaSchema = z.object({
  alignment: z.enum(['left', 'center', 'right']).default('center'),
  size:      z.enum(['sm', 'md', 'lg']).default('md'),
})

// DIVIDER — görsel ayraç
export const DividerMetaSchema = z.object({
  style:     z.enum(['solid', 'dashed', 'dotted', 'gradient']).default('solid'),
  color:     hex.optional(),
  thickness: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
})

// EMBED — video/müzik gömme
export const EmbedMetaSchema = z.object({
  platform:     z.enum(['youtube', 'spotify', 'tiktok', 'vimeo', 'soundcloud', 'instagram']),
  embedId:      z.string().min(1),     // URL'den çıkarılan ID
  thumbnailUrl: z.string().url().optional(),
  blockTheme:   BlockThemeOverrideSchema,
})

// IMAGE — tek görsel
export const ImageMetaSchema = z.object({
  imageUrl:   z.string().url(),
  altText:    z.string().max(200).optional(),
  caption:    z.string().max(200).optional(),
  link:       safeUrl.optional(),
  blockTheme: BlockThemeOverrideSchema,
})

// MAP — harita
export const MapMetaSchema = z.object({
  address:    z.string().min(1).max(500),
  lat:        z.number().optional(),
  lng:        z.number().optional(),
  zoom:       z.number().int().min(1).max(20).optional(),
  blockTheme: BlockThemeOverrideSchema,
})

// FAQ — accordion
export const FaqMetaSchema = z.object({
  items: z.array(z.object({
    question: z.string().min(1).max(300),
    answer:   z.string().min(1).max(1000),
  })).min(1).max(30),
  blockTheme: BlockThemeOverrideSchema,
})

// CONTACT_FORM — iletişim formu
export const ContactFormMetaSchema = z.object({
  fields:           z.array(z.enum(['name', 'email', 'phone', 'message'])).min(1),
  submitButtonText: z.string().max(50).optional(),
  successMessage:   z.string().max(200).optional(),
  notifyEmail:      z.string().email().optional(),  // form gelince bu adrese bildirim
  blockTheme:       BlockThemeOverrideSchema,
})

// COLLECTION — card grid grubu
export const CollectionMetaSchema = z.object({
  description: z.string().max(200).optional(),
  columns:     z.union([z.literal(2), z.literal(3)]).default(2),
  gap:         z.enum(['sm', 'md', 'lg']).default('md'),
  blockTheme:  BlockThemeOverrideSchema,
})

// EMAIL_CAPTURE — email listesi toplama
export const EmailCaptureMetaSchema = z.object({
  title:           z.string().max(100).optional(),   // "Bültenime abone ol"
  description:     z.string().max(200).optional(),
  namePlaceholder: z.string().max(50).optional(),    // isim alanı placeholder
  emailPlaceholder: z.string().max(50).optional(),
  buttonText:      z.string().max(50).optional(),    // "Abone Ol"
  showNameField:   z.boolean().default(false),        // isim alanı gösterilsin mi
  successMessage:  z.string().max(200).optional(),   // "Teşekkürler!"
  blockTheme:      BlockThemeOverrideSchema,
})

// CONTACT_DETAILS — iletişim bilgileri gösterimi
// Her alan tıklanabilir: tel → tel:, email → mailto:, whatsapp → wa.me, line → line.me
export const ContactDetailsMetaSchema = z.object({
  phone:    z.string().max(30).optional(),           // +66812345678
  email:    z.string().email().optional(),
  website:  safeUrl.optional(),
  address:  z.string().max(300).optional(),
  lineId:   z.string().max(50).optional(),           // LINE ID — SEA için kritik
  whatsapp: z.string().max(30).optional(),           // numara — wa.me/NUMARA
  telegram: z.string().max(50).optional(),           // @username
  wechat:   z.string().max(50).optional(),
})

// SOCIAL_PROOF — takipçi/abone sayısı gösterimi
// Veriler elle girilir — otomatik API çekilmez (Meta/TikTok API onayları çok karmaşık)
export const SocialProofMetaSchema = z.object({
  items: z.array(z.object({
    platform: z.enum([
      'instagram', 'tiktok', 'youtube', 'twitter', 'facebook',
      'spotify', 'twitch', 'linkedin', 'pinterest', 'threads',
    ]),
    count:  z.string().max(20),     // "1.2M", "500K", "10,000" — formatlı string
    label:  z.string().max(50).optional(),  // "Takipçi", "Abone", "Dinleyici"
  })).min(1).max(6),
  layout: z.enum(['row', 'grid']).default('row'),
})

// ─────────────────────────────────────────
// BLOK OLUŞTURMA / GÜNCELLEME ŞEMALARI
// ─────────────────────────────────────────

export const CreateLinkSchema = z.object({
  type:          z.nativeEnum({ LINK: 'LINK', SOCIAL: 'SOCIAL', HEADER: 'HEADER', DIVIDER: 'DIVIDER', EMBED: 'EMBED', IMAGE: 'IMAGE', MAP: 'MAP', FAQ: 'FAQ', COLLECTION: 'COLLECTION', CONTACT_FORM: 'CONTACT_FORM', EMAIL_CAPTURE: 'EMAIL_CAPTURE', CONTACT_DETAILS: 'CONTACT_DETAILS', SOCIAL_PROOF: 'SOCIAL_PROOF' } as const),
  title:         z.string().min(1, 'Başlık boş olamaz').max(100),
  url:           safeUrl.optional(),   // HEADER, DIVIDER, SOCIAL, FAQ, MAP, CONTACT_FORM için null
  cardStyle:     z.enum(['basic', 'image', 'music', 'book', 'video', 'product']).optional(),
  metadata:      z.record(z.unknown()).optional(),  // Tip kontrolü service katmanında
  position:      z.number().int().min(0),
  parentId:      z.string().optional(),   // collection çocuğu ise
})

export const UpdateLinkSchema = z.object({
  title:         z.string().min(1).max(100).optional(),
  url:           safeUrl.optional(),
  cardStyle:     z.enum(['basic', 'image', 'music', 'book', 'video', 'product']).optional(),
  metadata:      z.record(z.unknown()).optional(),
  isActive:      z.boolean().optional(),
  isHighlighted: z.boolean().optional(),
  startsAt:      z.string().datetime().optional().nullable(),  // ISO string, null = kaldır
  endsAt:        z.string().datetime().optional().nullable(),
  password:      z.string().min(4).max(50).optional().nullable(),
  clickLimit:    z.number().int().min(1).optional().nullable(),
})

// Sıralama: [{ id: "abc", position: 0 }, { id: "xyz", position: 1 }]
export const ReorderLinksSchema = z.object({
  links: z.array(z.object({
    id:       z.string(),
    position: z.number().int().min(0),
  })).min(1),
})

// Şifreli link girişi
export const UnlockLinkSchema = z.object({
  password: z.string().min(1),
})

export type CreateLinkInput   = z.infer<typeof CreateLinkSchema>
export type UpdateLinkInput   = z.infer<typeof UpdateLinkSchema>
export type ReorderLinksInput = z.infer<typeof ReorderLinksSchema>
export type UnlockLinkInput   = z.infer<typeof UnlockLinkSchema>
