export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  const memberships = await prisma.staffMembership.findMany({
    where: { clubId: club.id, active: true },
    include: {
      user: { select: { id: true, name: true, nameEn: true, email: true, phone: true } },
      coach: { select: { id: true, nameFa: true, nameEn: true, city: true } },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })
  const upcomingSessions = await prisma.coachSession.findMany({
    where: { coach: { clubId: club.id }, date: { gte: todayDateStr() }, status: { not: 'CANCELLED' } },
    include: { coach: true },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    take: 20,
  })

  return {
    staff: memberships.map((membership) => ({
      id: membership.id,
      role: membership.role,
      permissionsJson: membership.permissionsJson,
      user: membership.user,
      coach: membership.coach,
    })),
    upcomingSessions,
  }
})
