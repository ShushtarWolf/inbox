/**
 * Admin-only: hide an active club from public directory while keeping /clubs/:slug live.
 */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ isUnlisted?: boolean }>(event)
  if (!id || typeof body?.isUnlisted !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'isUnlisted must be a boolean' })
  }

  const exists = await prisma.club.findUnique({ where: { id }, select: { id: true } })
  if (!exists) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  const club = await prisma.club.update({
    where: { id },
    data: { isUnlisted: body.isUnlisted },
    select: { id: true, slug: true, isUnlisted: true },
  })
  return club
})