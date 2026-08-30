import { assertPackagesEnabled, packagesEnabledForEvent } from '../../../utils/packagesGate'
import { assertDateNotInPast } from '../../../utils/reservations'

export default defineEventHandler(async (event) => {
  const { club, user } = await requireOwnerClub(event, 'calendar')

  if (event.method === 'GET') {
    if (!packagesEnabledForEvent(event)) return []
    return prisma.packageDraft.findMany({
      where: { clubId: club.id, status: { not: 'CANCELLED' } },
      include: {
        coach: true,
        court: true,
        _count: { select: { bookings: true, players: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  assertPackagesEnabled(event)
  const body = await readBody<{
    title?: string
    capacity?: number
    price?: number
    discount?: number
    level?: number
    startDate?: string
    finishDate?: string
    coachId?: string | null
    courtId?: string
    comment?: string
    daysJson?: string
    timesJson?: string
    days?: string[]
    dayTimes?: Record<string, { start: string; end: string }>
    publish?: boolean
  }>(event)

  if (!body.courtId) {
    throw createError({ statusCode: 400, statusMessage: 'courtId required' })
  }
  const court = await prisma.court.findFirst({
    where: { id: body.courtId, clubId: club.id },
  })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Court not found' })

  if (body.coachId) {
    const coach = await prisma.coach.findFirst({
      where: {
        id: body.coachId,
        approvalStatus: 'APPROVED',
      },
    })
    if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach not found' })
  }

  if (body.startDate) assertDateNotInPast(body.startDate)
  if (body.startDate && body.finishDate && body.finishDate < body.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Finish date must be on or after start date' })
  }

  const daysJson = body.daysJson
    || (body.days?.length ? JSON.stringify(body.days) : null)
  const timesJson = body.timesJson
    || (body.dayTimes ? JSON.stringify(body.dayTimes) : null)

  const draft = await prisma.packageDraft.create({
    data: {
      clubId: club.id,
      courtId: body.courtId,
      title: body.title?.trim() || 'پکیج جدید',
      capacity: body.capacity || 8,
      price: body.price || 0,
      discount: body.discount || 0,
      level: body.level ?? null,
      startDate: body.startDate,
      finishDate: body.finishDate,
      daysJson,
      timesJson,
      coachId: body.coachId || null,
      comment: body.comment,
      createdByUserId: user.id,
      status: 'DRAFT',
    },
    include: {
      coach: true,
      court: true,
      _count: { select: { bookings: true, players: true } },
    },
  })

  if (body.publish) {
    const { publishPackageDraft } = await import('../../../utils/packages')
    return publishPackageDraft({
      packageId: draft.id,
      clubId: club.id,
      actorUserId: user.id,
    })
  }

  return draft
})
