export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  assertCoachProductEnabled(event)
  const query = getQuery(event)
  const status = typeof query.status === 'string' ? query.status : undefined
  const allowed = ['PENDING', 'APPROVED', 'REJECTED'] as const

  const coaches = await prisma.coach.findMany({
    orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
    take: 100,
    where: {
      ...(status && allowed.includes(status as (typeof allowed)[number])
        ? { approvalStatus: status as (typeof allowed)[number] }
        : {}),
    },
    include: {
      sport: { select: { slug: true } },
      user: { select: { id: true, name: true, email: true, phone: true } },
      club: { select: { id: true, nameFa: true } },
    },
  })

  return {
    applications: coaches.map((coach) => ({
      id: coach.id,
      nameFa: coach.nameFa,
      nameEn: coach.nameEn,
      city: coach.city,
      sessionPrice: coach.sessionPrice,
      sportSlug: coach.sport.slug,
      status: coach.approvalStatus,
      approvalNote: coach.approvalNote,
      appliedAt: coach.appliedAt?.toISOString() || null,
      reviewedAt: coach.reviewedAt?.toISOString() || null,
      userName: coach.user?.name || null,
      userEmail: coach.user?.email || null,
      userPhone: coach.user?.phone || null,
      clubName: coach.club?.nameFa || null,
    })),
  }
})
