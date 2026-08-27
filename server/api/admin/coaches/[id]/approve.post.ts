export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  assertCoachProductEnabled(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  const coach = await prisma.coach.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
  })
  if (!coach || coach.approvalStatus === 'APPROVED') {
    throw createError({ statusCode: 404, statusMessage: 'Coach application not found' })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.coach.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        approvalNote: null,
        reviewedAt: new Date(),
      },
    })
    // Legacy: Coach.clubId without CoachClubLink left owners with an empty مربی‌های مستقل list.
    await backfillClubLinkFromPrimaryClub(
      { id: next.id, clubId: coach.clubId },
      tx,
    )
    return next
  })

  await notifyCoachApplicationReviewed({
    approved: true,
    coachName: coach.nameFa,
    email: coach.user?.email,
    phone: coach.user?.phone,
  })

  return { id: updated.id, status: updated.approvalStatus }
})
