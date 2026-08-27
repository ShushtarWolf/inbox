import { addOneHour } from '../../utils/reservations'
import { isPastDate, isSlotStartInPast } from '#shared/localDate.ts'

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({
    where: { userId: user.id },
    include: { availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] } },
  })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })

  const query = getQuery(event)
  const date = typeof query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
    ? query.date
    : todayDateStr()

  const dayOfWeek = new Date(`${date}T00:00:00`).getDay()
  const windows = coach.availability
    .filter((item) => item.dayOfWeek === dayOfWeek)
    .map((item) => ({ id: item.id, startTime: item.startTime, endTime: item.endTime }))

  const sessions = await prisma.coachSession.findMany({
    where: {
      coachId: coach.id,
      date,
      status: { not: 'CANCELLED' },
    },
    include: { athlete: { select: { name: true, phone: true } } },
    orderBy: { startTime: 'asc' },
  })

  const takenTimes = new Set(sessions.map((session) => session.startTime))
  const freeSlots: Array<{ startTime: string; endTime: string }> = []

  if (!isPastDate(date)) {
    for (const window of windows) {
      const startHour = Number(window.startTime.split(':')[0] || 0)
      const endHour = Number(window.endTime.split(':')[0] || 0)
      for (let hour = startHour; hour < endHour; hour++) {
        const startTime = `${String(hour).padStart(2, '0')}:00`
        if (!takenTimes.has(startTime) && !isSlotStartInPast(date, startTime)) {
          freeSlots.push({ startTime, endTime: addOneHour(startTime) })
        }
      }
    }
  }

  return {
    date,
    dayOfWeek,
    windows,
    sessions: sessions.map((session) => ({
      id: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      status: session.status,
      paymentStatus: session.paymentStatus,
      athlete: session.athlete,
    })),
    freeSlots,
    weeklyAvailability: coach.availability.map((item) => ({
      id: item.id,
      dayOfWeek: item.dayOfWeek,
      startTime: item.startTime,
      endTime: item.endTime,
    })),
  }
})
