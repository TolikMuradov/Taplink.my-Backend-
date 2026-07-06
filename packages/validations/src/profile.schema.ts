import { z } from 'zod'
import { DesignSettingsSchema } from './design.schema'

// Username kuralları: sadece harf, rakam ve tire — 3 ila 30 karakter
// Örnek geçerli: "john-doe", "taplink123"
// Örnek geçersiz: "jo", "john doe", "john_doe!"
export const UsernameSchema = z
  .string()
  .min(3, 'Kullanıcı adı en az 3 karakter olmalı')
  .max(30, 'Kullanıcı adı en fazla 30 karakter olabilir')
  .regex(
    /^[a-z0-9-]+$/,
    'Kullanıcı adı sadece küçük harf, rakam ve tire içerebilir'
  )
  .refine((val) => !val.startsWith('-') && !val.endsWith('-'), {
    message: 'Kullanıcı adı tire ile başlayamaz veya bitemez',
  })

export const UpdateProfileSchema = z.object({
  displayName:    z.string().max(60).optional(),
  bio:            z.string().max(200, 'Bio en fazla 200 karakter olabilir').optional(),
  seoTitle:       z.string().max(60, 'SEO başlığı en fazla 60 karakter olabilir').optional(),
  seoDescription: z.string().max(160, 'SEO açıklaması en fazla 160 karakter olabilir').optional(),
  isPublic:       z.boolean().optional(),
  // Tasarım ayarları — kısmi değil, tüm obje gönderilir
  // Frontend mevcut designSettings'i alır, değiştirir, tamamını gönderir
  // design.schema.ts içindeki DesignSettingsSchema ile tam validasyon yapılır
  designSettings: DesignSettingsSchema.optional(),
})

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
