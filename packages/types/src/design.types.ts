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
