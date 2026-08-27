export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const { club } = await requireOwnerClub(event, 'team')

  // Heal legacy coaches who set this club as home without creating a CoachClubLink.
  const orphanCoaches = await prisma.coach.findMany({
    where: {
      clubId: club.id,
      approvalStatus: 'APPROVED',
      clubLinks: { none: { clubId: club.id } },
    },
    select: { id: true, clubId: true },
  })
  for (const orphan of orphanCoaches) {
    await backfillClubLinkFromPrimaryClub(orphan)
  }

  const staffCoachIds = new Set(
    (
      await prisma.staffMembership.findMany({
        where: { clubId: club.id, active: true, coachId: { not: null } },
        select: { coachId: true },
      })
    )
      .map((row) => row.coachId)
      .filter((id): id is string => Boolean(id)),
  )

  const links = await prisma.coachClubLink.findMany({
    where: { clubId: club.id },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      coach: {
        select: {
          id: true,
          nameFa: true,
          nameEn: true,
          city: true,
          sessionPrice: true,
          photo: true,
          approvalStatus: true,
          user: { select: { phone: true, email: true } },
        },
      },
    },
  })

  return {
    links: links
      .filter((link) => link.coach.approvalStatus === 'APPROVED')
      .filter((link) => !staffCoachIds.has(link.coach.id))
      .map((link) => ({
        id: link.id,
        status: link.status,
        courtDiscountPercent: link.courtDiscountPercent,
        coach: {
          id: link.coach.id,
          nameFa: link.coach.nameFa,
          nameEn: link.coach.nameEn,
          city: link.coach.city,
          sessionPrice: link.coach.sessionPrice,
          photo: link.coach.photo,
          phone: link.coach.user?.phone || null,
          email: link.coach.user?.email || null,
        },
      })),
  }
})
