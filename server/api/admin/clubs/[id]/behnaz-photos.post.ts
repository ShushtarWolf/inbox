/**
 * Attach باشگاه بهناز Court 1 WebP gallery to a club.
 * POST /api/admin/clubs/:id/behnaz-photos
 * Header: x-admin-secret
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Club id required' })

  const club = await prisma.club.findUnique({ where: { id }, select: { id: true, slug: true, nameFa: true } })
  if (!club) throw createError({ statusCode: 404, statusMessage: 'Club not found' })

  const result = await applyBehnazCourt1Photos(prisma, club.id)
  return { ok: true, club, ...result }
})
