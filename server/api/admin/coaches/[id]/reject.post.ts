export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  assertCoachProductEnabled(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }
  const body = await readBody<{ note?: string }>(event)

  const coach = await prisma.coach.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
  })
  if (!coach || coach.approvalStatus === 'REJECTED') {
    throw createError({ statusCode: 404, statusMessage: 'Coach application not found' })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.coach.update({
      where: { id },
      data: {
        approvalStatus: 'REJECTED',
        approvalNote: body.note?.trim() || null,
        reviewedAt: new Date(),
        clubId: null,
      },
    })
    // Revoke club affiliations so a later re-approve needs fresh owner consent.
    await tx.coachClubLink.updateMany({
      where: { coachId: id, status: { in: ['PENDING', 'ACTIVE'] } },
      data: { status: 'BLOCKED' },
    })
    return next
  })

  await notifyCoachApplicationReviewed({
    approved: false,
    coachName: coach.nameFa,
    note: updated.approvalNote,
    email: coach.user?.email,
    phone: coach.user?.phone,
  })

  return { id: updated.id, status: updated.approvalStatus }
})
