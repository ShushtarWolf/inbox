/**
 * Sync the live MVP pilot club (find by slug or دانشگاه علم و صنعت).
 * POST /api/admin/pilot-club/sync
 * Header: x-admin-secret
 * Body: { clubId?: string, slug?: string }
 */
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

  const result = await syncPilotClub(prisma, club.id)
  return { ok: true, previous: club, ...result }
})
