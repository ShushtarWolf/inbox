import { assertPackagesEnabled, packagesEnabledForEvent } from '../../../utils/packagesGate'
import { requireApprovedCoach, requireActiveClub } from '../../../utils/coachClubLinks'
import { assertDateNotInPast } from '../../../utils/reservations'
import { publishPackageDraft } from '../../../utils/packages'

export default defineEventHandler(async (event) => {
  if (event.method === 'GET') {
    const user = await requireRole(event, 'COACH')
    if (!packagesEnabledForEvent(event)) return []
    const coach = await requireApprovedCoach(user.id)
    const query = getQuery(event)
    const clubId = typeof query.clubId === 'string' ? query.clubId : ''
    if (!clubId) {
      throw createError({ statusCode: 400, statusMessage: 'clubId required' })
    }
    await requireActiveClub(clubId)
    return prisma.packageDraft.findMany({
      where: {
        clubId,
        coachId: coach.id,
        status: { not: 'CANCELLED' },
      },
      include: {
        court: true,
        _count: { select: { bookings: true, players: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  assertPackagesEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await requireApprovedCoach(user.id)
  const body = await readBody<{
    clubId?: string
    title?: string
    capacity?: number
    price?: number
    discount?: number
    level?: number
    startDate?: string
    finishDate?: string
    courtId?: string
    comment?: string
    daysJson?: string
    timesJson?: string
    days?: string[]
    dayTimes?: Record<string, { start: string; end: string }>
    publish?: boolean
  }>(event)

  if (!body.clubId) throw createError({ statusCode: 400, statusMessage: 'clubId required' })
  await requireActiveClub(body.clubId)

  if (!body.courtId) {
    throw createError({ statusCode: 400, statusMessage: 'courtId required' })
  }
  const court = await prisma.court.findFirst({
    where: { id: body.courtId, clubId: body.clubId },
  })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Court not found' })

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
      clubId: body.clubId,
      courtId: body.courtId,
      coachId: coach.id,
      title: body.title?.trim() || 'پکیج جدید',
      capacity: body.capacity || 8,
      price: body.price || 0,
      discount: body.discount || 0,
      level: body.level ?? null,
      startDate: body.startDate,
      finishDate: body.finishDate,
      daysJson,
      timesJson,
      comment: body.comment,
      createdByUserId: user.id,
      status: 'DRAFT',
    },
    include: {
      court: true,
      _count: { select: { bookings: true, players: true } },
    },
  })

  if (body.publish) {
    return publishPackageDraft({
      packageId: draft.id,
      clubId: body.clubId,
      actorUserId: user.id,
    })
  }

  return draft
})
