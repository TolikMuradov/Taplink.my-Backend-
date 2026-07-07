import { FastifyInstance }  from 'fastify'
import { prisma }           from '@taplink/db'
import { getPublicProfile, processLinkClick } from './public.service'
import { recordClick, recordView }            from '../analytics/analytics.service'
import { getVisitorIp, getDeviceType, getReferrer, getCountry } from './public.helpers'
import { ErrorCodes }       from '@taplink/validations'

export async function publicRoutes(fastify: FastifyInstance) {

  // ─────────────────────────────────────────
  // GET /api/p/:username — Profil verisi (auth yok)
  // ─────────────────────────────────────────
  fastify.get('/api/p/:username', async (req, reply) => {
    const { username } = req.params as { username: string }

    const { error, data } = await getPublicProfile(username)

    // Gizli profil → 404 (varlığını açığa vurma)
    if (error === ErrorCodes.PROFILE_NOT_FOUND || error === ErrorCodes.PROFILE_IS_PRIVATE) {
      return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })
    }

    // CDN + tarayıcı cache
    reply.header(
      'Cache-Control',
      'public, s-maxage=60, max-age=30, stale-while-revalidate=120'
    )

    return reply.send({ success: true, data })
  })

  // ─────────────────────────────────────────
  // POST /api/p/:username/view — Görüntüleme kaydet (auth yok)
  // ─────────────────────────────────────────
  fastify.post('/api/p/:username/view', async (req, reply) => {
    const { username } = req.params as { username: string }

    const { error, data } = await getPublicProfile(username)
    if (error || !data) {
      return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })
    }

    const profile = await prisma.profile.findFirst({
      where:  { username: username.toLowerCase() },
      select: { id: true },
    })
    if (!profile) return reply.status(404).send({ success: false, code: ErrorCodes.PROFILE_NOT_FOUND })

    // Async kaydet — ziyaretçiyi beklettirme
    recordView({
      profileId: profile.id,
      visitorIp: getVisitorIp(req),
      timestamp: Date.now(),
    }).catch(() => {})

    return reply.status(204).send()
  })

  // ─────────────────────────────────────────
  // POST /api/p/r/:linkId — Link tıklama (auth yok)
  // Body: { unlockToken?: string }
  // ─────────────────────────────────────────
  fastify.post('/api/p/r/:linkId', async (req, reply) => {
    const { linkId } = req.params as { linkId: string }
    const body = req.body as { unlockToken?: string } | undefined
    const unlockToken = body?.unlockToken ?? null

    const { error, url } = await processLinkClick(linkId, unlockToken)

    if (error) {
      const status =
        error === ErrorCodes.LINK_NOT_FOUND           ? 404 :
        error === ErrorCodes.LINK_PASSWORD_INCORRECT  ? 401 :
        error === ErrorCodes.LINK_CLICK_LIMIT_REACHED ? 410 :
        error === ErrorCodes.LINK_NOT_SCHEDULED       ? 410 :
        error === ErrorCodes.LINK_EXPIRED             ? 410 : 400
      return reply.status(status).send({ success: false, code: error })
    }

    // profileId'yi bul, tıklamayı async kaydet
    const linkRecord = await prisma.link.findUnique({
      where:  { id: linkId },
      select: { profileId: true },
    })

    if (linkRecord) {
      recordClick({
        profileId: linkRecord.profileId,
        linkId,
        country:   getCountry(req),
        device:    getDeviceType(req),
        referrer:  getReferrer(req),
        timestamp: Date.now(),
      }).catch(() => {})
    }

    return reply.send({ success: true, data: { url } })
  })
}
