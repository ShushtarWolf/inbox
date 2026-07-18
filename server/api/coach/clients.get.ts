export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({ where: { userId: user.id } })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })
  const sessions = await prisma.coachSession.findMany({
    where: { coachId: coach.id, date: { gte: todayDateStr() } },
    include: { athlete: { select: { id: true, name: true, phone: true } } },
    orderBy: { date: 'asc' },
  })
  const clients = [...new Map(sessions.map((s) => [s.athlete.id, {
    ...s.athlete,
    nextSessionDate: s.date,
    nextSessionTime: s.startTime,
  }])).values()]
  return { sessions, clients }
})
