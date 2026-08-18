import { isRetiredPilotClubName } from '#shared/pilotClub.ts'

/**
 * Sync MVP pilot club to دانشگاه علم و صنعت with 3 tennis courts + real WebP gallery.
 * POST /api/admin/clubs/:id/behnaz-photos  (legacy path; also used for IUST sync)
 * Header: x-admin-secret
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Club id required' })

  const club = await prisma.club.findUnique({ where: { id }, select: { id: true, slug: true, nameFa: true } })
  if (!club) throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  if (isRetiredPilotClubName(club.nameFa)) {
    throw createError({ statusCode: 404, statusMessage: 'Pilot club not found' })
  }

  const result = await syncPilotClub(prisma, club.id)
  return { ok: true, ...result }
})
