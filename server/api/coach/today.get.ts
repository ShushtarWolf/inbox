export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({ where: { userId: user.id } })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })
  const today = todayDateStr()
  const sessions = await prisma.coachSession.findMany({
    where: { coachId: coach.id, date: today },
    include: { athlete: { select: { name: true, phone: true } } },
    orderBy: { startTime: 'asc' },
  })
  return { coach, sessions }
})
