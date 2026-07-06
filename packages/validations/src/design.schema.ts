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
