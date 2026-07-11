export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const courtBookings = await prisma.booking.findMany({
    where: { userId: user.id },
    include: {
      slot: { include: { court: { include: { club: true, sport: true } } } },
      coach: true,
      payment: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  const coachSessions = await prisma.coachSession.findMany({
    where: { athleteId: user.id },
    include: { coach: { include: { sport: true, club: true } }, payment: true },
    orderBy: { createdAt: 'desc' },
  })
  const packageBookings = await prisma.packageBooking.findMany({
    where: { athleteId: user.id },
    include: {
      package: { include: { club: true, coach: true } },
      payment: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  return { courtBookings, coachSessions, packageBookings }
})
