export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({
    where: { userId: user.id },
    select: { id: true, clubId: true },
  })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })

  const [links, clubs] = await Promise.all([
    prisma.coachClubLink.findMany({
      where: { coachId: coach.id },
      orderBy: { createdAt: 'desc' },
      include: { club: { select: { id: true, nameFa: true, nameEn: true, city: true } } },
    }),
    prisma.club.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { nameFa: 'asc' },
      select: { id: true, nameFa: true, nameEn: true, city: true },
    }),
  ])

  const linkedClubIds = new Set(links.map((link) => link.clubId))
  return {
    primaryClubId: coach.clubId,
    links: links.map((link) => ({
      id: link.id,
      status: link.status,
      courtDiscountPercent: link.courtDiscountPercent,
      club: link.club,
    })),
    availableClubs: clubs.filter((club) => !linkedClubIds.has(club.id)),
  }
})
