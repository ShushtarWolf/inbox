import { resolveClubSlugAlias } from '#shared/clubSlugAliases.ts'
import { assertSlotBookable } from '../utils/reservations'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session?.user?.id
  const body = await readBody<{
    clubSlug?: string
    date?: string
    startTime?: string
    endTime?: string
    coachId?: string
    courtId?: string
    guestName?: string
    guestMobile?: string
  }>(event)

  if (!body.clubSlug || !body.date || !body.startTime || !body.endTime) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid waitlist request' })
  }

  const slug = resolveClubSlugAlias(body.clubSlug)
  const club = await prisma.club.findUnique({ where: { slug } })
  if (!club || !club.waitlistEnabled) {
    throw createError({ statusCode: 404, statusMessage: 'Waitlist is not available' })
  }

  assertSlotBookable(body.date, body.startTime)

  const entry = await prisma.waitlistEntry.create({
    data: {
      clubId: club.id,
      userId,
      coachId: body.coachId,
      courtId: body.courtId,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      guestName: body.guestName,
      guestMobile: body.guestMobile,
    },
  })
  await prisma.reservationEvent.create({
    data: {
      actorUserId: userId,
      type: 'WAITLIST_JOINED',
      metadataJson: JSON.stringify({ clubId: club.id, coachId: body.coachId, courtId: body.courtId }),
    },
  })

  return { ok: true, entry }
})
