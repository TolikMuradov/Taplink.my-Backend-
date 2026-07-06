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
