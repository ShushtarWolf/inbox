export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({ where: { userId: user.id } })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })
  const today = todayDateStr()
  const sessions = await prisma.coachSession.findMany({
    where: { coachId: coach.id, date: { gte: today } },
    include: { athlete: { select: { id: true, name: true, phone: true } } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })
  const allSessions = await prisma.coachSession.findMany({
    where: { coachId: coach.id, status: { not: 'CANCELLED' } },
    include: { athlete: { select: { id: true, name: true, phone: true } } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  type ClientRow = {
    id: string
    name: string
    phone: string
    nextSessionDate: string | null
    nextSessionTime: string | null
    upcomingCount: number
    unpaidDue: number
  }
  const byAthlete = new Map<string, ClientRow>()
  for (const s of allSessions) {
    let row = byAthlete.get(s.athlete.id)
    if (!row) {
      row = {
        id: s.athlete.id,
        name: s.athlete.name,
        phone: s.athlete.phone,
        nextSessionDate: null,
        nextSessionTime: null,
        upcomingCount: 0,
        unpaidDue: 0,
      }
      byAthlete.set(s.athlete.id, row)
    }
    if (s.date >= today) {
      row.upcomingCount += 1
      if (!row.nextSessionDate) {
        row.nextSessionDate = s.date
        row.nextSessionTime = s.startTime
      }
      if (s.paymentStatus !== 'PAID') row.unpaidDue += s.price || 0
    }
  }

  const clients = [...byAthlete.values()].sort((a, b) => {
    if (a.nextSessionDate && b.nextSessionDate) return a.nextSessionDate.localeCompare(b.nextSessionDate)
    if (a.nextSessionDate) return -1
    if (b.nextSessionDate) return 1
    return a.name.localeCompare(b.name)
  })
  return { sessions, clients }
})
