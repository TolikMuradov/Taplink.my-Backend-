# Step 03 — Shared Tipler & Validasyonlar

**Bağımlılık:** Step 02 tamamlanmış olmalı (Prisma şeması ve migration hazır).  
**Sonraki Step:** Step 04 (Auth), Step 05 (Profil) ve sonraki tüm modül step'leri bu step'e bağımlıdır.

> ⚠️ **Önemli:** Bu step'i ekipteki en deneyimli kişi yapmalı. Burada alınan kararlar hem backend hem frontend'i doğrudan etkiler. Bir tip yanlış tanımlanırsa onlarca yerde hata çıkar.

---

## Amaç

`packages/types` ve `packages/validations` paketlerini kurmak. Bu iki paket projenin "ortak dili" — backend bir veri döndürdüğünde hangi şekilde döndüreceğini, frontend bir form gönderdiğinde hangi alanların zorunlu olduğunu buradan öğrenir. İkisi de aynı paketi kullandığı için hiçbir zaman senkronizasyon bozulmaz.

**Bu step bittikten sonra:**
- `packages/validations`: Tüm giriş verilerini doğrulayan Zod şemaları hazır
- `packages/types`: API'ın dışarıya döndürdüğü response tipleri hazır
- Her iki paket hem `apps/api` hem `apps/web` tarafından içe aktarılabilir

---

## Neden Bu Kararlar?

**Zod — neden başka validation kütüphanesi değil?**  
Zod'un en büyük avantajı şudur: şemayı bir kere yazarsın, hem runtime doğrulama hem TypeScript tipi buradan üretilir. Örnek:

```typescript
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

type LoginInput = z.infer<typeof LoginSchema>
// LoginInput artık { email: string, password: string } tipine sahip
// Ayrı interface yazmana gerek yok
```

Joi veya Yup alternatifleri TypeScript ile sonradan entegre edilmiş, tip desteği zayıf. Zod baştan TypeScript için tasarlanmış.

**Neden ayrı `packages/types` ve `packages/validations`?**  
- `packages/validations`: Gelen veriyi kontrol eder (kullanıcıdan gelen form, API isteği)
- `packages/types`: Giden veriyi tanımlar (API'ın döndürdüğü response şekli)

Backend bu ikisini de kullanır. Frontend sadece `validations`'ı form doğrulaması için, `types`'ı ise API cevabını işlemek için kullanır. Karıştırmak karmaşa yaratır.

**Neden Prisma tipleri direkt kullanılmıyor?**  
Prisma tipleri veritabanı modelini temsil eder — şifre hash'i, dahili ID'ler, her şey oradadır. API'dan bunu doğrudan göndermek güvenlik açığıdır. `packages/types` içindeki response tipleri sadece frontend'e göstermek istediğimiz alanları içerir.

```typescript
// Prisma'dan gelen — GÜVENLİ DEĞİL, API'dan gönderme
type PrismaUser = {
  id: string
  email: string
  password: string  // ← hash olsa bile gönderilmemeli
  plan: Plan
  ...
}

// packages/types içindeki — GÜVENLİ, bunu gönder
type UserResponse = {
  id: string
  email: string
  name: string
  plan: Plan
  // password YOK
}
```

---

## Gereksinimler

- Step 01 tamamlanmış (monorepo yapısı var)
- Step 02 tamamlanmış (Prisma şeması var — enum'lar buradan alınacak)
- `packages/types/` ve `packages/validations/` klasörleri mevcut (Step 01'de oluşturuldu)

---

## TODO

### 1. `packages/validations` Kurulumu

- [ ] `packages/validations/package.json` güncelle:
  ```json
  {
    "name": "@taplink/validations",
    "version": "0.0.1",
    "private": true,
    "exports": {
      ".": "./src/index.ts"
    },
    "dependencies": {
      "zod": "^3.22.0"
    },
    "devDependencies": {
      "typescript": "^5.0.0"
    }
  }
  ```

- [ ] `packages/validations/tsconfig.json` oluştur:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "commonjs",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "declaration": true,
      "outDir": "dist"
    },
    "include": ["src"]
  }
  ```

### 2. Validasyon Şemalarını Yaz

- [ ] `packages/validations/src/` klasörü oluştur.

- [ ] `packages/validations/src/auth.schema.ts` oluştur:
  ```typescript
  import { z } from 'zod'

  export const RegisterSchema = z.object({
    name: z
      .string()
      .min(2, 'İsim en az 2 karakter olmalı')
      .max(50, 'İsim en fazla 50 karakter olabilir'),
    email: z.string().email('Geçerli bir email adresi girin'),
    password: z
      .string()
      .min(8, 'Şifre en az 8 karakter olmalı')
      .regex(/[A-Z]/, 'Şifre en az bir büyük harf içermeli')
      .regex(/[0-9]/, 'Şifre en az bir rakam içermeli'),
  })

  export const LoginSchema = z.object({
    email: z.string().email('Geçerli bir email adresi girin'),
    password: z.string().min(1, 'Şifre boş olamaz'),
  })

  export const ForgotPasswordSchema = z.object({
    email: z.string().email('Geçerli bir email adresi girin'),
  })

  export const ResetPasswordSchema = z.object({
    token: z.string().min(1),
    password: z
      .string()
      .min(8, 'Şifre en az 8 karakter olmalı')
      .regex(/[A-Z]/, 'Şifre en az bir büyük harf içermeli')
      .regex(/[0-9]/, 'Şifre en az bir rakam içermeli'),
  })

  // Tip üretimi — ayrıca interface yazmaya gerek yok
  export type RegisterInput = z.infer<typeof RegisterSchema>
  export type LoginInput = z.infer<typeof LoginSchema>
  export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>
  export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>
  ```

- [ ] `packages/validations/src/profile.schema.ts` oluştur:
  ```typescript
  import { z } from 'zod'

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

  import { DesignSettingsSchema } from './design.schema'

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
  ```

- [ ] `packages/validations/src/link.schema.ts` oluştur:
  ```typescript
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
  ```

- [ ] `packages/validations/src/design.schema.ts` oluştur:
  ```typescript
  import { z } from 'zod'

  // ─────────────────────────────────────────
  // YARDIMCI — Renk validasyonu
  // ─────────────────────────────────────────

  // Standart hex: #rrggbb
  const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Geçerli hex renk kodu girin (#rrggbb)')

  // Hex veya rgba() — card arka planları için
  const color = z.union([
    hex,
    z.string().regex(/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(\s*,\s*[\d.]+)?\s*\)$/, 'Geçerli renk değeri girin'),
  ])

  // ─────────────────────────────────────────
  // PROFİL ARKA PLANI (Wallpaper)
  // ─────────────────────────────────────────

  const WallpaperSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('solid'),    color: hex }),
    z.object({ type: z.literal('gradient'), from: hex, to: hex, direction: z.string() }),
    z.object({ type: z.literal('image'),    url: z.string().url(), blur: z.number().min(0).max(20), overlay: z.number().min(0).max(1) }),
    z.object({ type: z.literal('animated'), animationId: z.enum(['particles', 'waves', 'bubbles', 'confetti']) }),
  ])

  // ─────────────────────────────────────────
  // PROFİL BAŞLIĞI, METİN, BUTON
  // ─────────────────────────────────────────

  const HeaderSchema = z.object({
    layout:          z.enum(['centered', 'left', 'right']),
    avatarStyle:     z.enum(['circle', 'square', 'rounded', 'hexagon']),
    showAvatar:      z.boolean(),
    showDisplayName: z.boolean(),
    showBio:         z.boolean(),
  })

  const TextSchema = z.object({
    fontFamily:  z.enum(['inter', 'poppins', 'playfair-display', 'roboto', 'montserrat', 'lato', 'nunito', 'dm-sans']),
    titleSize:   z.enum(['sm', 'md', 'lg']),
    titleWeight: z.enum(['normal', 'medium', 'bold']),
    titleColor:  hex,
    bioColor:    hex,
  })

  const ColorPaletteSchema = z.object({
    primary:    hex,
    background: hex,
    text:       hex,
    accent:     hex,
  })

  const FooterSchema = z.object({
    showBranding: z.boolean(),
  })

  // ─────────────────────────────────────────
  // BLOK TASARIM SİSTEMİ
  // Buttons ve cards aynı şeydir — her ikisi de bir link bloğunun
  // görünümünü tarif eder. `cardStyle` neyin gösterileceğini belirler
  // (basic/music/book...), BlockDesign ise nasıl göründüğünü.
  // Tüm blok tipleri (basic buton dahil) bu sistemi paylaşır.
  // ─────────────────────────────────────────

  // Blok arka planı
  const BlockBackgroundSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('solid'),       color:   color }),
    z.object({ type: z.literal('gradient'),    from:    color, to: color, direction: z.string() }),
    z.object({ type: z.literal('blur'),        opacity: z.number().min(0).max(100) }),
    z.object({ type: z.literal('transparent') }),
  ])

  // Profil geneli blok tasarımı — DesignSettings.blocks içinde saklanır
  export const BlockDesignSchema = z.object({
    // Üst düzey stil — filled/outline/soft/shadow/blur
    // Bu alan background + border + shadow kombinasyonunun kısa adı
    // Frontend bu değere göre uygun görünümü uygular
    style:           z.enum(['filled', 'outline', 'soft', 'shadow', 'blur']),

    // Şekil (köşe yuvarlama)
    shape:           z.enum(['pill', 'rounded', 'square']),

    // Arka plan — tüm blok tipleri için geçerli
    background:      BlockBackgroundSchema,

    // Metin renkleri
    textColor:       hex,    // açıklama, meta bilgi (sanatçı adı, fiyat vb.)
    titleColor:      hex,    // blok başlığı

    // Border (outline ve gradient border için)
    borderColor:     hex.optional(),
    borderGradient:  z.object({
      from:      hex,
      to:        hex,
      direction: z.string(),
    }).optional(),

    // Gölge rengi (shadow stil için)
    shadowColor:     hex.optional(),

    // İkon pozisyonu (basic/buton görünümünde)
    iconPosition:    z.enum(['left', 'right', 'none']),

    // Gölge yoğunluğu
    shadow:          z.enum(['none', 'sm', 'md', 'lg']),
  })

  // ─────────────────────────────────────────
  // TASARIM AYARLARI (Ana şema)
  // ─────────────────────────────────────────

  const designBase = {
    wallpaper: WallpaperSchema,
    header:    HeaderSchema,
    text:      TextSchema,
    blocks:    BlockDesignSchema,  // buton + card tasarımı tek sistemde
    colors:    ColorPaletteSchema,
    footer:    FooterSchema,
  }

  export const DesignSettingsSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('custom'),  ...designBase }),
    z.object({ type: z.literal('curated'), templateId: z.string().min(1), ...designBase }),
  ])

  export type DesignSettingsInput = z.infer<typeof DesignSettingsSchema>

  // BlockBackgroundSchema dışa aç — link.schema.ts kullanır
  export { BlockBackgroundSchema }
  ```

- [ ] `packages/validations/src/index.ts` oluştur (hepsini tek yerden export et):
  ```typescript
  export * from './auth.schema'
  export * from './profile.schema'
  export * from './link.schema'
  export * from './design.schema'
  export * from './error-codes'
  ```

- [ ] `packages/types/src/index.ts` güncelle:
  ```typescript
  export * from './api.types'
  export * from './user.types'
  export * from './profile.types'
  export * from './link.types'
  export * from './design.types'
  export * from './analytics.types'
  ```

- [ ] `packages/validations/src/error-codes.ts` oluştur — **tüm API hata kodları tek yerde:**

  > **Neden?** Backend mesaj değil kod döner (`"USERNAME_TAKEN"`), frontend kodu kendi diline çevirir. Böylece backend dil bilmez, yeni dil eklemek sadece frontend işi olur.

  ```typescript
  // Projedeki tüm API hata kodları
  // Backend bu kodları döner — frontend çevirir
  // Yeni bir hata eklendiğinde buraya da eklenmeli

  export const ErrorCodes = {
    // Auth
    EMAIL_ALREADY_EXISTS:       'EMAIL_ALREADY_EXISTS',
    INVALID_CREDENTIALS:        'INVALID_CREDENTIALS',
    EMAIL_NOT_VERIFIED:         'EMAIL_NOT_VERIFIED',
    SESSION_EXPIRED:            'SESSION_EXPIRED',
    UNAUTHORIZED:               'UNAUTHORIZED',
    TOO_MANY_REQUESTS:          'TOO_MANY_REQUESTS',

    // Kullanıcı
    USER_NOT_FOUND:             'USER_NOT_FOUND',
    USERNAME_TAKEN:             'USERNAME_TAKEN',
    INVALID_USERNAME:           'INVALID_USERNAME',

    // Profil
    PROFILE_NOT_FOUND:          'PROFILE_NOT_FOUND',
    PROFILE_IS_PRIVATE:         'PROFILE_IS_PRIVATE',

    // Link & Block
    LINK_NOT_FOUND:             'LINK_NOT_FOUND',
    LINK_LIMIT_REACHED:         'LINK_LIMIT_REACHED',
    INVALID_URL:                'INVALID_URL',
    LINK_PASSWORD_INCORRECT:    'LINK_PASSWORD_INCORRECT',
    LINK_CLICK_LIMIT_REACHED:   'LINK_CLICK_LIMIT_REACHED',
    LINK_NOT_SCHEDULED:         'LINK_NOT_SCHEDULED',    // henüz aktif değil (startsAt)
    LINK_EXPIRED:               'LINK_EXPIRED',          // süresi doldu (endsAt)
    COLLECTION_CHILD_ERROR:     'COLLECTION_CHILD_ERROR', // collection dışı blok parent alamaz

    // Dosya yükleme
    FILE_TOO_LARGE:             'FILE_TOO_LARGE',
    INVALID_FILE_TYPE:          'INVALID_FILE_TYPE',

    // Ödeme / Plan
    SUBSCRIPTION_REQUIRED:      'SUBSCRIPTION_REQUIRED', // Pro gerektiren özellik
    PAYMENT_FAILED:             'PAYMENT_FAILED',

    // Genel
    VALIDATION_ERROR:           'VALIDATION_ERROR',
    INTERNAL_ERROR:             'INTERNAL_ERROR',
    NOT_FOUND:                  'NOT_FOUND',
  } as const

  export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

  // API hata cevabı her zaman bu şekilde olmalı:
  // { success: false, code: ErrorCode, message?: string }
  // message alanı opsiyonel — sadece development modda ek detay için
  ```

### 3. `packages/types` Kurulumu

- [ ] `packages/types/package.json` güncelle:
  ```json
  {
    "name": "@taplink/types",
    "version": "0.0.1",
    "private": true,
    "exports": {
      ".": "./src/index.ts"
    },
    "devDependencies": {
      "typescript": "^5.0.0"
    }
  }
  ```

- [ ] `packages/types/tsconfig.json` oluştur (packages/validations ile aynı içerik).

### 4. Response Tiplerini Yaz

- [ ] `packages/types/src/` klasörü oluştur.

- [ ] `packages/types/src/api.types.ts` oluştur — tüm API response'larının sarmalayıcısı:
  ```typescript
  import type { ErrorCode } from './error-codes' // packages/validations'dan

  // Tüm API cevapları bu formatta döner
  // Başarılı: { success: true, data: {...} }
  // Hatalı:   { success: false, code: "USERNAME_TAKEN", message?: "..." }
  // NOT: Frontend 'code' değerini kendi diline çevirir — backend mesaj göndermez
  export type ApiResponse<T> =
    | { success: true; data: T }
    | { success: false; code: ErrorCode; message?: string }

  // Sayfalanmış listeler için
  export type PaginatedResponse<T> = {
    items: T[]
    total: number
    page: number
    pageSize: number
    hasMore: boolean
  }
  ```

- [ ] `packages/types/src/user.types.ts` oluştur:
  ```typescript
  export type Plan = 'FREE' | 'PRO' | 'BUSINESS'

  // API'dan dönen kullanıcı — şifre ve dahili alanlar YOK
  export type UserResponse = {
    id: string
    name: string
    email: string
    emailVerified: boolean
    plan: Plan
    createdAt: string // ISO date string
  }
  ```

- [ ] `packages/types/src/design.types.ts` oluştur — **tasarım sistemi tipleri:**
  ```typescript
  // Tema tipi: kullanıcı özelleştirdiği mi, hazır şablon mu
  export type ThemeType = 'custom' | 'curated'

  // Arka plan seçenekleri
  export type WallpaperType = 'solid' | 'gradient' | 'image' | 'animated'

  export type WallpaperSettings =
    | { type: 'solid';    color: string }
    | { type: 'gradient'; from: string; to: string; direction: string }
    | { type: 'image';    url: string; blur: number; overlay: number }
    | { type: 'animated'; animationId: 'particles' | 'waves' | 'bubbles' | 'confetti' }

  // Profil başlığı (avatar + isim alanı)
  export type HeaderLayout    = 'centered' | 'left' | 'right'
  export type AvatarStyle     = 'circle' | 'square' | 'rounded' | 'hexagon'

  export type HeaderSettings = {
    layout:          HeaderLayout
    avatarStyle:     AvatarStyle
    showAvatar:      boolean
    showDisplayName: boolean
    showBio:         boolean
  }

  // Metin / yazı tipi ayarları
  // fontFamily değerleri frontend'de Google Fonts ile eşleştirilir
  export type FontFamily =
    | 'inter'
    | 'poppins'
    | 'playfair-display'
    | 'roboto'
    | 'montserrat'
    | 'lato'
    | 'nunito'
    | 'dm-sans'

  export type FontSize   = 'sm' | 'md' | 'lg'
  export type FontWeight = 'normal' | 'medium' | 'bold'

  export type TextSettings = {
    fontFamily:  FontFamily
    titleSize:   FontSize
    titleWeight: FontWeight
    titleColor:  string   // hex renk
    bioColor:    string   // hex renk
  }

  // ─────────────────────────────────────────
  // BLOK TASARIM SİSTEMİ
  // buttons ve cards aynı sistemde birleşti.
  // cardStyle ne gösterileceğini belirler (basic/music/book...).
  // BlockDesign nasıl göründüğünü belirler — tüm blok tipleri paylaşır.
  // ─────────────────────────────────────────

  export type BlockStyle    = 'filled' | 'outline' | 'soft' | 'shadow' | 'blur'
  export type BlockShape    = 'pill' | 'rounded' | 'square'
  export type BlockShadow   = 'none' | 'sm' | 'md' | 'lg'
  export type IconPosition  = 'left' | 'right' | 'none'

  export type BlockBackground =
    | { type: 'solid';       color: string }
    | { type: 'gradient';    from: string; to: string; direction: string }
    | { type: 'blur';        opacity: number }   // 0-100, cam/frosted glass
    | { type: 'transparent' }

  // Profil geneli blok tasarımı — DesignSettings.blocks içinde saklanır
  export type BlockDesign = {
    style:           BlockStyle      // üst düzey stil kısayolu
    shape:           BlockShape      // köşe yuvarlama
    background:      BlockBackground // arka plan — tüm blok tipleri için
    textColor:       string          // hex — açıklama / meta bilgi
    titleColor:      string          // hex — blok başlığı
    borderColor?:    string          // hex — outline stili için
    borderGradient?: { from: string; to: string; direction: string }
    shadowColor?:    string          // hex — shadow stili için
    iconPosition:    IconPosition    // basic/buton görünümünde ikon yeri
    shadow:          BlockShadow     // gölge yoğunluğu
  }

  // Bireysel blok override — Link.metadata.blockTheme içinde saklanır
  // Belirtilmeyen alanlar DesignSettings.blocks'tan devralınır
  export type BlockThemeOverride = Partial<BlockDesign>

  // ─────────────────────────────────────────
  // GENEL RENK PALETİ & ALT BİLGİ
  // ─────────────────────────────────────────

  export type ColorPalette = {
    primary:    string  // hex — marka rengi
    background: string  // hex — sayfa arka planı
    text:       string  // hex — genel yazı rengi
    accent:     string  // hex — vurgu (hover, aktif link vs.)
  }

  export type FooterSettings = {
    showBranding: boolean
    // FREE'de her zaman true — backend zorlar
    // PRO/BUSINESS'te false yapılabilir
  }

  // ─────────────────────────────────────────
  // ANA TASARIM AYARLARI
  // ─────────────────────────────────────────

  export type DesignSettings = {
    type:        ThemeType
    templateId?: string
    wallpaper:   WallpaperSettings
    header:      HeaderSettings
    text:        TextSettings
    blocks:      BlockDesign         // buton + card tek sistemde
    colors:      ColorPalette
    footer:      FooterSettings
  }

  // Varsayılan tasarım — yeni hesaplarda ve sıfırlamada kullanılır
  export const DEFAULT_DESIGN: DesignSettings = {
    type:      'custom',
    wallpaper: { type: 'solid', color: '#ffffff' },
    header:    { layout: 'centered', avatarStyle: 'circle', showAvatar: true, showDisplayName: true, showBio: true },
    text:      { fontFamily: 'inter', titleSize: 'md', titleWeight: 'bold', titleColor: '#111111', bioColor: '#666666' },
    blocks: {
      style:        'filled',
      shape:        'pill',
      background:   { type: 'solid', color: '#111111' },
      textColor:    '#aaaaaa',
      titleColor:   '#ffffff',
      iconPosition: 'left',
      shadow:       'none',
    },
    colors: { primary: '#111111', background: '#ffffff', text: '#111111', accent: '#6366f1' },
    footer: { showBranding: true },
  }
  ```

- [ ] `packages/types/src/profile.types.ts` oluştur:
  ```typescript
  import type { DesignSettings } from './design.types'

  export type ProfileResponse = {
    id:             string
    username:       string
    displayName:    string | null
    bio:            string | null
    avatarUrl:      string | null
    backgroundUrl:  string | null
    designSettings: DesignSettings  // null gelmez — backend DEFAULT_DESIGN ile doldurur
    isPublic:       boolean
    seoTitle:       string | null
    seoDescription: string | null
  }
  ```

- [ ] `packages/types/src/link.types.ts` oluştur:
  ```typescript
  import type { BlockThemeOverride } from './design.types'

  // ─────────────────────────────────────────
  // BLOK TİPLERİ
  // ─────────────────────────────────────────

  export type LinkType =
    | 'LINK' | 'SOCIAL' | 'HEADER' | 'DIVIDER'
    | 'EMBED' | 'IMAGE' | 'MAP' | 'FAQ'
    | 'COLLECTION' | 'CONTACT_FORM'

  export type CardStyle = 'basic' | 'image' | 'music' | 'book' | 'video' | 'product'

  // ─────────────────────────────────────────
  // METADATA TİPLERİ — her blok tipi için
  // ─────────────────────────────────────────

  export type SocialPlatform =
    | 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'facebook'
    | 'linkedin' | 'pinterest' | 'snapchat' | 'whatsapp' | 'telegram'
    | 'github' | 'behance' | 'dribbble' | 'spotify' | 'soundcloud'
    | 'twitch' | 'discord' | 'reddit' | 'medium' | 'threads'

  // LINK card stilleri için metadata
  export type LinkBasicMeta   = { iconType?: string; iconValue?: string; description?: string; thumbnailUrl?: string; blockTheme?: BlockThemeOverride }
  export type LinkMusicMeta   = { imageUrl?: string; artist?: string; album?: string; duration?: string; platform?: string; blockTheme?: BlockThemeOverride }
  export type LinkBookMeta    = { imageUrl?: string; author?: string; description?: string; genre?: string; blockTheme?: BlockThemeOverride }
  export type LinkVideoMeta   = { thumbnailUrl?: string; channelName?: string; duration?: string; platform?: string; blockTheme?: BlockThemeOverride }
  export type LinkProductMeta = { imageUrl?: string; price?: number; originalPrice?: number; currency?: string; blockTheme?: BlockThemeOverride }

  export type SocialMeta = {
    platforms: { platform: SocialPlatform; url: string; customLabel?: string }[]
    iconStyle: 'filled' | 'outline' | 'minimal'
    iconSize:  'sm' | 'md' | 'lg'
    layout:    'row' | 'grid'
  }

  export type HeaderMeta  = { alignment: 'left' | 'center' | 'right'; size: 'sm' | 'md' | 'lg' }
  export type DividerMeta = { style: 'solid' | 'dashed' | 'dotted' | 'gradient'; color?: string; thickness: 1 | 2 | 3 }

  export type EmbedMeta = {
    platform:      'youtube' | 'spotify' | 'tiktok' | 'vimeo' | 'soundcloud' | 'instagram'
    embedId:       string
    thumbnailUrl?: string
    blockTheme?:   BlockThemeOverride
  }

  export type ImageMeta       = { imageUrl: string; altText?: string; caption?: string; link?: string; blockTheme?: BlockThemeOverride }
  export type MapMeta         = { address: string; lat?: number; lng?: number; zoom?: number; blockTheme?: BlockThemeOverride }
  export type FaqMeta         = { items: { question: string; answer: string }[]; blockTheme?: BlockThemeOverride }
  export type ContactFormMeta = { fields: string[]; submitButtonText?: string; successMessage?: string; notifyEmail?: string; blockTheme?: BlockThemeOverride }
  export type CollectionMeta  = { description?: string; columns: 2 | 3; gap: 'sm' | 'md' | 'lg'; blockTheme?: BlockThemeOverride }

  export type EmailCaptureMeta = {
    title?: string; description?: string
    namePlaceholder?: string; emailPlaceholder?: string
    buttonText?: string; showNameField?: boolean
    successMessage?: string; blockTheme?: BlockThemeOverride
  }

  export type ContactDetailsMeta = {
    phone?: string; email?: string; website?: string; address?: string
    lineId?: string; whatsapp?: string; telegram?: string; wechat?: string
  }

  export type SocialProofMeta = {
    items: { platform: string; count: string; label?: string }[]
    layout: 'row' | 'grid'
  }

  // Union tipi — hangi tipte olduğunu discriminate etmek için
  export type LinkMeta =
    | LinkBasicMeta | LinkMusicMeta | LinkBookMeta
    | LinkVideoMeta | LinkProductMeta | SocialMeta
    | HeaderMeta | DividerMeta | EmbedMeta | ImageMeta
    | MapMeta | FaqMeta | ContactFormMeta | CollectionMeta
    | EmailCaptureMeta | ContactDetailsMeta | SocialProofMeta

  // ─────────────────────────────────────────
  // API RESPONSE TİPLERİ
  // ─────────────────────────────────────────

  export type LinkResponse = {
    id:            string
    type:          LinkType
    title:         string
    url:           string | null
    cardStyle:     CardStyle
    metadata:      LinkMeta | null
    position:      number
    isActive:      boolean
    isHighlighted: boolean
    hasPassword:   boolean        // password var mı — hash'i döndürme
    startsAt:      string | null  // ISO date
    endsAt:        string | null
    clickLimit:    number | null
    clickCount:    number         // Redis'ten anlık sayaç
    children?:     LinkResponse[] // COLLECTION tipi için
  }

  // Şifreli linke erişim cevabı
  export type UnlockLinkResponse = {
    unlocked: boolean
    token:    string   // kısa süreli oturum token'ı — ziyaretçi bu token ile içeriği görür
  }
  ```

- [ ] `packages/types/src/analytics.types.ts` oluştur:
  ```typescript
  export type ClickStats = {
    totalClicks: number
    totalViews: number
    // Günlük breakdown — son 30 gün
    daily: {
      date: string // "2024-01-15"
      clicks: number
      views: number
    }[]
    // Ülke breakdown
    byCountry: {
      country: string // "TH", "ID"
      clicks: number
    }[]
    // Cihaz breakdown
    byDevice: {
      device: string // "mobile", "desktop"
      clicks: number
    }[]
  }

  export type LinkStats = {
    linkId: string
    title: string
    clicks: number
    percentage: number // toplam içindeki yüzdesi
  }
  ```

- [ ] `packages/types/src/index.ts` oluştur:
  ```typescript
  export * from './api.types'
  export * from './user.types'
  export * from './profile.types'
  export * from './link.types'
  export * from './analytics.types'
  ```

### 5. Bağımlılıkları Kur

- [ ] Root klasörde çalıştır:
  ```bash
  pnpm install
  ```

### 6. `apps/api`'ye Bağla

- [ ] `apps/api/package.json` içine bu iki paketi bağımlılık olarak ekle:
  ```json
  {
    "dependencies": {
      "@taplink/types": "workspace:*",
      "@taplink/validations": "workspace:*"
    }
  }
  ```
  `workspace:*` ifadesi pnpm'e "bu paketi monorepo içinden al" der.

- [ ] Tekrar `pnpm install` çalıştır.

### 7. Doğrulama — Kullanım Testi

- [ ] `apps/api/src/index.ts` dosyasına geçici olarak şunu ekle, çalıştır, sonra sil:
  ```typescript
  import { RegisterSchema } from '@taplink/validations'
  import type { UserResponse } from '@taplink/types'

  // Test: validasyon çalışıyor mu?
  const result = RegisterSchema.safeParse({
    name: 'Test',
    email: 'gecersiz-email',
    password: '123',
  })
  console.log('Validasyon testi:', result.success) // false olmalı
  console.log('Hatalar:', result.error?.errors)

  // Test: tip tanınıyor mu? (Bu sadece derleme zamanı testi)
  const user: UserResponse = {
    id: 'test',
    name: 'Test',
    email: 'test@test.com',
    emailVerified: true,
    plan: 'FREE',
    createdAt: new Date().toISOString(),
  }
  console.log('Tip testi:', user.name)
  ```
- [ ] `pnpm --filter @taplink/api dev` çalıştır — terminalde `Validasyon testi: false` ve hata listesi görünmeli.
- [ ] Test kodunu sil, dosyayı eski haline getir.

---

## Debug Notları

**"Cannot find module '@taplink/validations'"**
→ `apps/api/package.json` içine `"@taplink/validations": "workspace:*"` eklenmemiş.
→ Ekledikten sonra `pnpm install` çalıştır.

**"Module not found: @taplink/types"**
→ Aynı sorun. `apps/api/package.json` içine `"@taplink/types": "workspace:*"` ekle.

**TypeScript "Type 'X' is not assignable to type 'Y'" hatası**
→ Response tipinde olmayan bir alan eklenmeye çalışılıyor veya zorunlu alan eksik.
→ `packages/types/src/` içindeki ilgili tipi kontrol et.

**Zod şemasında "required" hatası beklenen alanda çıkmıyor**
→ Alana `.optional()` eklenmiş olabilir — şemayı kontrol et.
→ Zod'da `.optional()` o alanı zorunlu olmaktan çıkarır.

**"workspace:* not found" hatası**
→ `pnpm install` çalıştırılmamış veya paket adı yanlış yazılmış.
→ `package.json` içindeki `"name"` alanını ve bağımlılıktaki adı karşılaştır — birebir aynı olmalı.

> **Genel kural:** Bu step'te runtime hata olmaz — her şey tip ve şema tanımı. Hata görüyorsan büyük ihtimalle paket adı yanlış veya `pnpm install` çalıştırılmamış.

---

## Güvenlik Notları

- URL validasyonunda `http://` veya `https://` zorunlu tutuldu — `javascript:` gibi zararlı protokollerin link olarak girilmesi engelleniyor.
- Şifre kuralları minimum güvenlik sağlar — büyük harf ve rakam zorunlu. Bu kuralları gevşetme.
- Response tiplerinde şifre, token veya dahili sistem alanı **kesinlikle** olmamalı. Yeni alan eklerken dikkat et.
- `customColors` alanında hex renk validasyonu var — CSS injection girişimlerine karşı.

---

## Teslim Kriterleri

- [ ] `pnpm install` hatasız çalışıyor
- [ ] `apps/api`'de `import { RegisterSchema } from '@taplink/validations'` hata vermiyor
- [ ] `apps/api`'de `import type { UserResponse } from '@taplink/types'` hata vermiyor
- [ ] Validasyon testi çalıştırıldığında geçersiz veri `success: false` dönüyor
- [ ] Tüm şema dosyaları mevcut: `auth.schema.ts`, `profile.schema.ts`, `link.schema.ts`, `design.schema.ts`, `error-codes.ts`
- [ ] Tüm tip dosyaları mevcut: `api.types.ts`, `user.types.ts`, `profile.types.ts`, `link.types.ts`, `design.types.ts`, `analytics.types.ts`
- [ ] `DesignSettings` tipi `blocks: BlockDesign` alanını içeriyor
- [ ] `LinkResponse` tipi `type`, `cardStyle`, `metadata`, `hasPassword`, `children` alanlarını içeriyor
- [ ] `BlockThemeOverrideSchema` Zod şeması export ediliyor
- [ ] `DEFAULT_DESIGN` içinde `blocks` alanı mevcut
