import { assertDateNotInPast } from '../../utils/reservations'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  if (event.method === 'GET') {
    return prisma.packageDraft.findMany({
      where: { clubId: club.id },
      include: {
        coach: true,
        _count: { select: { bookings: true, players: true } },
      },
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
