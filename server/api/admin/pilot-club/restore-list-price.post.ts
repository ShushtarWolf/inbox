/**
 * Restore MVP list/court prices (not SEP test amounts).
 * POST /api/admin/pilot-club/restore-list-price
 * Header: x-admin-secret
 */
import { restorePilotListPrice } from '../../../utils/behnazClubPhotos'
import { PILOT_CLUB_SLUG } from '#shared/pilotClub.ts'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const body = await readBody<{ clubId?: string; slug?: string }>(event).catch(() => ({}))

  let club = null as null | { id: string; slug: string; nameFa: string }

  if (body?.clubId) {
    club = await prisma.club.findUnique({
      where: { id: body.clubId },
      select: { id: true, slug: true, nameFa: true },
    })
  } else if (body?.slug) {
    club = await prisma.club.findUnique({
      where: { slug: body.slug },
      select: { id: true, slug: true, nameFa: true },
    })
  } else {
    club = await prisma.club.findFirst({
      where: {
        OR: [
          { slug: PILOT_CLUB_SLUG },
          { slug: 'club-9208f4' },
          { nameFa: { contains: 'علم و صنعت' } },
        ],
      },
      orderBy: { verifiedAt: 'desc' },
      select: { id: true, slug: true, nameFa: true },
    })
  }

  if (!club) throw createError({ statusCode: 404, statusMessage: 'Pilot club not found' })

  const result = await restorePilotListPrice(prisma, club.id)
  // #region agent log
  fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9cb647'},body:JSON.stringify({sessionId:'9cb647',runId:'gap-fill',hypothesisId:'C',location:'restore-list-price.post.ts',message:'restored list price',data:{slug:club.slug,price:result.price,courtsUpdated:result.courtsUpdated,openSlotsUpdated:result.openSlotsUpdated},timestamp:Date.now()})}).catch(()=>{})
  // #endregion
  return { ok: true, previous: club, ...result }
})
