export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const application = await prisma.clubApplication.findUnique({ where: { id } })
  if (!application || application.status !== 'PENDING') {
    throw createError({ statusCode: 404, statusMessage: 'Application not found' })
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (application.clubId) {
      await tx.club.update({
        where: { id: application.clubId },
        data: { status: 'SUSPENDED' },
      })
    }

    return tx.clubApplication.update({
      where: { id },
      data: { status: 'REJECTED' },
    })
  })

  return {
    id: updated.id,
    status: updated.status,
    clubId: application.clubId,
  }
})
