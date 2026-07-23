import { isRecurringReserveEnabled } from '#shared/recurringReserve.ts'
import { assertDateNotInPast } from '../../../utils/reservations'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  if (event.method === 'GET') {
    // MVP: empty list so leftover UI cannot invent drafts; create stays 403.
    if (!isRecurringReserveEnabled()) return []
    return prisma.packageDraft.findMany({
      where: { clubId: club.id },
      include: {
        coach: true,
        _count: { select: { bookings: true, players: true } },
      },
    })
  }
  if (!isRecurringReserveEnabled()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'RECURRING_RESERVE_DISABLED',
    })
  }
  const body = await readBody<{
    title?: string
    capacity?: number
    price?: number
    discount?: number
    level?: number
    startDate?: string
    finishDate?: string
    coachId?: string
    comment?: string
    daysJson?: string
    timesJson?: string
    equipmentId?: string
  }>(event)
  if (body.startDate) assertDateNotInPast(body.startDate)
  return prisma.packageDraft.create({
    data: {
      clubId: club.id,
      title: body.title || 'پکیج جدید',
      capacity: body.capacity || 8,
      price: body.price || 0,
      discount: body.discount || 0,
      level: body.level ?? null,
      startDate: body.startDate,
      finishDate: body.finishDate,
      daysJson: body.daysJson,
      timesJson: body.timesJson,
      coachId: body.coachId,
      comment: body.equipmentId ? [body.comment, `equipment:${body.equipmentId}`].filter(Boolean).join(' | ') : body.comment,
    },
  })
})
