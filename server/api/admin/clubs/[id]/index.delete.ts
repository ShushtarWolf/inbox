import {
  assessClubDeletionBlockers,
  CLUB_DELETE_BLOCKED_MESSAGE,
  deleteClubWithDependents,
} from '../../../../utils/adminClubDelete.ts'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const club = await prisma.club.findUnique({
    where: { id },
    select: { id: true, nameFa: true, slug: true },
  })
  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }

  const blocker = await assessClubDeletionBlockers(prisma, id)
  if (blocker) {
    throw createError({
      statusCode: 409,
      statusMessage: CLUB_DELETE_BLOCKED_MESSAGE,
      data: { blocker, clubId: id },
    })
  }

  await prisma.$transaction(async (tx) => {
    const again = await assessClubDeletionBlockers(tx, id)
    if (again) {
      throw createError({
        statusCode: 409,
        statusMessage: CLUB_DELETE_BLOCKED_MESSAGE,
        data: { blocker: again, clubId: id },
      })
    }
    await deleteClubWithDependents(tx, id)
  })

  console.info('[admin:club-delete]', { clubId: club.id, slug: club.slug, nameFa: club.nameFa })

  return {
    ok: true,
    deletedClubId: club.id,
    clubName: club.nameFa,
  }
})