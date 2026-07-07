import { prisma }            from '@taplink/db'
import { redis }             from '../../lib/redis'
import { profileCacheKey, CACHE_TTL } from '../../lib/cache'
import { checkLinkSchedule } from '../link/link.helpers'
import { verifyUnlockToken } from './public.helpers'
import { ErrorCodes }        from '@taplink/validations'
import { DEFAULT_DESIGN }    from '@taplink/types'

// ─────────────────────────────────────────
// TİPLER
// ─────────────────────────────────────────

export type PublicLink = {
  id:            string
  type:          string
  title:         string
  url:           string | null     // şifreli linkte null
  cardStyle:     string
  metadata:      any | null        // şifreli linkte null
  position:      number
  isHighlighted: boolean
  hasPassword:   boolean
  children?:     PublicLink[]
}

export type PublicProfileData = {
  username:       string
  displayName:    string | null
  bio:            string | null
  avatarUrl:      string | null
  backgroundUrl:  string | null
  designSettings: any
  seoTitle:       string | null
  seoDescription: string | null
  links:          PublicLink[]
}

type RawLink = {
  id: string; type: string; title: string; url: string | null
  cardStyle: string; metadata: any; position: number
  isHighlighted: boolean; startsAt: Date | null; endsAt: Date | null
  password: string | null; clickLimit: number | null
  _count: { clicks: number }
  children?: RawLink[]
}

// ─────────────────────────────────────────
// ANA FONKSİYON — Ziyaretçiye gösterilecek profil verisi
// Redis cache (60s) → miss'te DB → cache'e yaz
// ─────────────────────────────────────────

export async function getPublicProfile(username: string): Promise<{
  error: string | null
  data:  PublicProfileData | null
}> {
  const cacheKey = profileCacheKey(username)

  // ── 1. Redis cache ──
  // NOT: @upstash/redis otomatik JSON deserialize eder — get zaten obje döndürebilir.
  // Defensive: string ise parse et, değilse doğrudan kullan. (Doküman JSON.parse
  // varsayıyordu; @upstash ile bu patlar.)
  const cached = await redis.get(cacheKey)
  if (cached) {
    const data = (typeof cached === 'string' ? JSON.parse(cached) : cached) as PublicProfileData
    return { error: null, data }
  }

  // ── 2. Veritabanı ──
  const profile = await prisma.profile.findFirst({
    where: { username: username.toLowerCase() },
    select: {
      id: true, username: true, displayName: true, bio: true,
      avatarUrl: true, backgroundUrl: true, designSettings: true,
      isPublic: true, seoTitle: true, seoDescription: true,
      links: {
        where: { parentId: null, isActive: true },
        orderBy: { position: 'asc' },
        select: {
          id: true, type: true, title: true, url: true,
          cardStyle: true, metadata: true, position: true,
          isHighlighted: true, startsAt: true, endsAt: true,
          password: true, clickLimit: true,
          _count: { select: { clicks: true } },
          children: {
            where: { isActive: true },
            orderBy: { position: 'asc' },
            select: {
              id: true, type: true, title: true, url: true,
              cardStyle: true, metadata: true, position: true,
              isHighlighted: true, startsAt: true, endsAt: true,
              password: true, clickLimit: true,
              _count: { select: { clicks: true } },
            },
          },
        },
      },
    },
  })

  // ── 3. Bulunamadı veya gizli ──
  if (!profile) {
    return { error: ErrorCodes.PROFILE_NOT_FOUND, data: null }
  }
  if (!profile.isPublic) {
    return { error: ErrorCodes.PROFILE_IS_PRIVATE, data: null }
  }

  // ── 4. Linkleri filtrele/temizle ──
  const filteredLinks = (profile.links as unknown as RawLink[])
    .map((link) => filterAndSanitizeLink(link))
    .filter(Boolean) as PublicLink[]

  // ── 5. designSettings varsayılanla doldur ──
  const design = (profile.designSettings ?? DEFAULT_DESIGN) as any

  // ── 6. Response ──
  const data: PublicProfileData = {
    username:       profile.username,
    displayName:    profile.displayName,
    bio:            profile.bio,
    avatarUrl:      profile.avatarUrl,
    backgroundUrl:  profile.backgroundUrl,
    designSettings: design,
    seoTitle:       profile.seoTitle ?? profile.displayName ?? profile.username,
    seoDescription: profile.seoDescription ?? profile.bio,
    links:          filteredLinks,
  }

  // ── 7. Redis'e yaz (obje doğrudan — @upstash serialize eder) ──
  await redis.setex(cacheKey, CACHE_TTL.profile, data as any)

  return { error: null, data }
}

// ─────────────────────────────────────────
// LİNK FİLTRELEME/TEMİZLEME
// ─────────────────────────────────────────

function filterAndSanitizeLink(link: RawLink): PublicLink | null {
  // Zamanlama
  const { visible } = checkLinkSchedule(true, link.startsAt, link.endsAt)
  if (!visible) return null

  // clickLimit
  if (link.clickLimit !== null && link._count.clicks >= link.clickLimit) {
    return null
  }

  const hasPassword = !!link.password

  return {
    id:            link.id,
    type:          link.type,
    title:         link.title,
    url:           hasPassword ? null : link.url,       // şifreliyse URL gizli
    cardStyle:     link.cardStyle,
    metadata:      hasPassword ? null : link.metadata,  // şifreliyse metadata gizli
    position:      link.position,
    isHighlighted: link.isHighlighted,
    hasPassword,
    children:      link.children
      ?.map((child) => filterAndSanitizeLink(child))
      .filter(Boolean) as PublicLink[] | undefined,
  }
}

// ─────────────────────────────────────────
// LİNK TIKLAMA — kontroller + URL döndür
// ─────────────────────────────────────────

export async function processLinkClick(
  linkId:      string,
  unlockToken: string | null
): Promise<{ error: string | null; url: string | null }> {

  const link = await prisma.link.findUnique({
    where:  { id: linkId },
    select: {
      url: true, isActive: true, startsAt: true, endsAt: true,
      password: true, clickLimit: true,
      _count: { select: { clicks: true } },
    },
  })

  if (!link)          return { error: ErrorCodes.LINK_NOT_FOUND, url: null }
  if (!link.isActive) return { error: ErrorCodes.LINK_NOT_FOUND, url: null }
  if (!link.url)      return { error: ErrorCodes.LINK_NOT_FOUND, url: null }

  const { visible, reason } = checkLinkSchedule(link.isActive, link.startsAt, link.endsAt)
  if (!visible) return { error: reason ?? ErrorCodes.LINK_NOT_FOUND, url: null }

  if (link.clickLimit !== null && link._count.clicks >= link.clickLimit) {
    return { error: ErrorCodes.LINK_CLICK_LIMIT_REACHED, url: null }
  }

  // Şifre kontrolü
  if (link.password) {
    if (!unlockToken) return { error: ErrorCodes.LINK_PASSWORD_INCORRECT, url: null }
    if (!verifyUnlockToken(unlockToken, linkId)) {
      return { error: ErrorCodes.LINK_PASSWORD_INCORRECT, url: null }
    }
  }

  return { error: null, url: link.url }
}
