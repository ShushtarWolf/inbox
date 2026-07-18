import type { ClubStatus } from '@prisma/client'

const ALLOWED: ClubStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED']

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ status?: ClubStatus }>(event)
  if (!id || !body.status || !ALLOWED.includes(body.status)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const club = await prisma.club.findUnique({ where: { id } })
  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  const updated = await prisma.club.update({
    where: { id },
    data: { status: body.status },
    include: {
      owner: { select: { id: true, email: true, name: true } },
    },
  })

  return {
    id: updated.id,
    slug: updated.slug,
    status: updated.status,
    nameFa: updated.nameFa,
    nameEn: updated.nameEn,
    owner: updated.owner,
  }
})
