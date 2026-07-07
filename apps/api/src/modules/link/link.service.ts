import { prisma } from '@taplink/db'
import bcrypt from 'bcryptjs'
import { ErrorCodes } from '@taplink/validations'
import type { CreateLinkInput, UpdateLinkInput, ReorderLinksInput } from '@taplink/validations'
import { parseMetadata, requiresProPlan } from './link.helpers'
import { deleteFromR2 } from '../upload/upload.service'
import { invalidateProfileCacheByProfileId } from '../../lib/cache'
import { createUnlockToken } from '../../lib/link-token'

// ─────────────────────────────────────────
// OKUMA
// ─────────────────────────────────────────

// Profil sahibinin tüm bloklarını döner — sıralı, çocuklar dahil
export async function getLinksByProfileId(profileId: string) {
  return prisma.link.findMany({
    where: {
      profileId,
      parentId: null,   // sadece kök bloklar — çocuklar include ile gelir
    },
    orderBy: { position: 'asc' },
    include: {
      children: {
        orderBy: { position: 'asc' },
        // NOT: password ALANI SEÇİLMİYOR — hash dışarı çıkmasın.
        // (Doküman `password: false` yazıyordu ama Prisma select'e false kabul etmez.)
        select: {
          id: true, type: true, title: true, url: true,
          cardStyle: true, metadata: true, position: true,
          isActive: true, isHighlighted: true,
          startsAt: true, endsAt: true,
          clickLimit: true,
        },
      },
    },
  })
}

// ─────────────────────────────────────────
// OLUŞTURMA
// ─────────────────────────────────────────

export async function createLink(
  profileId: string,
  userPlan: string,
  input: CreateLinkInput
) {
  // Plan kontrolü
  if (requiresProPlan(input.type, input.cardStyle)) {
    if (userPlan === 'FREE') {
      return { error: ErrorCodes.SUBSCRIPTION_REQUIRED, link: null }
    }
  }

  // COLLECTION çocuğu ise parent'ın var ve aynı profile ait olduğunu doğrula
  if (input.parentId) {
    const parent = await prisma.link.findFirst({
      where: { id: input.parentId, profileId },
    })
    if (!parent) {
      return { error: ErrorCodes.LINK_NOT_FOUND, link: null }
    }
    if (parent.type !== 'COLLECTION') {
      return { error: ErrorCodes.COLLECTION_CHILD_ERROR, link: null }
    }
    // Çocuğun çocuğu olamaz — parent'ın parentId'si varsa red
    if (parent.parentId) {
      return { error: ErrorCodes.COLLECTION_CHILD_ERROR, link: null }
    }
  }

  // Metadata parse — tip + cardStyle'a göre doğru şema
  const { data: parsedMeta, error: metaError } = parseMetadata(
    input.type,
    input.cardStyle ?? null,
    input.metadata
  )
  if (metaError) {
    return { error: metaError, link: null }
  }

  const link = await prisma.link.create({
    data: {
      profileId,
      type:      input.type as any,   // Prisma enum
      title:     input.title,
      url:       input.url ?? null,
      cardStyle: input.cardStyle ?? 'basic',
      metadata:  (parsedMeta as any) ?? undefined,
      position:  input.position,
      parentId:  input.parentId ?? null,
    },
  })

  await invalidateProfileCacheByProfileId(profileId)
  return { error: null, link }
}

// ─────────────────────────────────────────
// GÜNCELLEME
// ─────────────────────────────────────────

export async function updateLink(
  linkId: string,
  profileId: string,
  userPlan: string,
  input: UpdateLinkInput
) {
  // Link var mı ve bu profile ait mi?
  const existing = await prisma.link.findFirst({
    where: { id: linkId, profileId },
  })
  if (!existing) return { error: ErrorCodes.LINK_NOT_FOUND, link: null }

  // Yeni cardStyle PRO gerektiriyor mu?
  const newCardStyle = input.cardStyle ?? existing.cardStyle
  if (requiresProPlan(existing.type, newCardStyle) && userPlan === 'FREE') {
    return { error: ErrorCodes.SUBSCRIPTION_REQUIRED, link: null }
  }

  // Schedule ve password PRO özellikleri
  if (userPlan === 'FREE') {
    if (input.startsAt !== undefined || input.endsAt !== undefined) {
      return { error: ErrorCodes.SUBSCRIPTION_REQUIRED, link: null }
    }
    if (input.password !== undefined) {
      return { error: ErrorCodes.SUBSCRIPTION_REQUIRED, link: null }
    }
    if (input.clickLimit !== undefined) {
      return { error: ErrorCodes.SUBSCRIPTION_REQUIRED, link: null }
    }
  }

  // Metadata parse
  const { data: parsedMeta, error: metaError } = parseMetadata(
    existing.type,
    newCardStyle,
    input.metadata
  )
  if (metaError) return { error: metaError, link: null }

  // Şifre varsa hash'le, null ise kaldır
  let passwordHash: string | null | undefined = undefined
  if (input.password === null) {
    passwordHash = null     // şifreyi kaldır
  } else if (input.password) {
    passwordHash = await bcrypt.hash(input.password, 10)
  }

  const link = await prisma.link.update({
    where: { id: linkId },
    data: {
      title:         input.title,
      url:           input.url,
      cardStyle:     input.cardStyle,
      metadata:      input.metadata !== undefined ? ((parsedMeta as any) ?? undefined) : undefined,
      isActive:      input.isActive,
      isHighlighted: input.isHighlighted,
      startsAt:      input.startsAt ? new Date(input.startsAt) : input.startsAt,
      endsAt:        input.endsAt   ? new Date(input.endsAt)   : input.endsAt,
      password:      passwordHash,
      clickLimit:    input.clickLimit,
    },
  })

  // Card görseli değiştiyse eski R2 dosyasını sil (depolama birikmesin)
  const oldMeta = existing.metadata as any
  const newMeta = parsedMeta as any
  const r2Base  = process.env.R2_PUBLIC_URL ?? ''
  if (
    oldMeta?.imageUrl &&
    newMeta?.imageUrl &&
    oldMeta.imageUrl !== newMeta.imageUrl &&
    r2Base &&
    oldMeta.imageUrl.includes(r2Base)
  ) {
    await deleteFromR2(oldMeta.imageUrl)  // sessiz hata — silme başarısız olsa da devam
  }

  await invalidateProfileCacheByProfileId(profileId)
  return { error: null, link }
}

// ─────────────────────────────────────────
// SİLME
// ─────────────────────────────────────────

export async function deleteLink(linkId: string, profileId: string) {
  const existing = await prisma.link.findFirst({
    where: { id: linkId, profileId },
  })
  if (!existing) return { error: ErrorCodes.LINK_NOT_FOUND }

  // COLLECTION silinince çocuklar otomatik silinir (onDelete: Cascade — Step 02)
  await prisma.link.delete({ where: { id: linkId } })
  await invalidateProfileCacheByProfileId(profileId)
  return { error: null }
}

// ─────────────────────────────────────────
// SIRALAMA
// ─────────────────────────────────────────

export async function reorderLinks(
  profileId: string,
  input: ReorderLinksInput
) {
  // Tüm ID'lerin bu profile ait olduğunu doğrula
  const ids = input.links.map(l => l.id)
  const existing = await prisma.link.findMany({
    where: { id: { in: ids }, profileId },
    select: { id: true },
  })

  if (existing.length !== ids.length) {
    return { error: ErrorCodes.LINK_NOT_FOUND }
  }

  // Batch güncelleme — transaction ile atomik
  await prisma.$transaction(
    input.links.map(({ id, position }) =>
      prisma.link.update({
        where: { id },
        data:  { position },
      })
    )
  )

  await invalidateProfileCacheByProfileId(profileId)
  return { error: null }
}

// ─────────────────────────────────────────
// ŞİFRELİ LİNK GİRİŞİ
// ─────────────────────────────────────────

export async function unlockLink(linkId: string, password: string) {
  const link = await prisma.link.findUnique({
    where: { id: linkId },
    select: { password: true, isActive: true },
  })

  if (!link) return { error: ErrorCodes.LINK_NOT_FOUND, token: null }
  if (!link.password) return { error: null, token: 'no-password-required' }

  const match = await bcrypt.compare(password, link.password)
  if (!match) return { error: ErrorCodes.LINK_PASSWORD_INCORRECT, token: null }

  // Kısa süreli, HMAC İMZALI erişim token'ı (public.helpers doğrular)
  const token = createUnlockToken(linkId)
  return { error: null, token }
}
