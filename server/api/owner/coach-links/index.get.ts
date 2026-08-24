export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const { club } = await requireOwnerClub(event, 'team')

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
