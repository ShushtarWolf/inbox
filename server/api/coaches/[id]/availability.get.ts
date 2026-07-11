import { addOneHour } from '../../../utils/reservations'
import { findCoachByIdOrSlug } from '../../../utils/coaches'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 404, statusMessage: 'Coach not found' })

  const query = getQuery(event)
  const date = (query.date as string) || todayDateStr()

  const coachRecord = await findCoachByIdOrSlug(id)
  if (!coachRecord) throw createError({ statusCode: 404, statusMessage: 'Coach not found' })

  const coach = await prisma.coach.findUnique({
    where: { id: coachRecord.id },
    include: { availability: true },
  })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach not found' })

  const dayOfWeek = new Date(`${date}T00:00:00`).getDay()
  const windows = coach.availability.filter((item) => item.dayOfWeek === dayOfWeek)
  const sessions = await prisma.coachSession.findMany({
    where: { coachId: coach.id, date, status: { not: 'CANCELLED' } },
    orderBy: { startTime: 'asc' },
  })
  const takenTimes = new Set(sessions.map((session) => session.startTime))
  const slots: Array<{ startTime: string; endTime: string }> = []

  for (const window of windows) {
    const startHour = Number(window.startTime.split(':')[0] || 0)
    const endHour = Number(window.endTime.split(':')[0] || 0)
    for (let hour = startHour; hour < endHour; hour++) {
      const startTime = `${String(hour).padStart(2, '0')}:00`
      if (!takenTimes.has(startTime)) {
        slots.push({ startTime, endTime: addOneHour(startTime) })
      }
    }
  }

  return { date, slots, sessionPrice: coach.sessionPrice }
})
