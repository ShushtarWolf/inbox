import {
  announceCompetitionToContacts,
  checkEventCalendarOverlap,
  updateCompetition,
  type CompetitionUpdateInput,
} from '../../../utils/competitions'
import { assertCompetitionsVisibleForClub } from '../../../utils/competitionsGate'
import type { CompetitionEnrollmentType, CompetitionPrizeType, CompetitionStatus } from '#shared/competition.ts'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  assertCompetitionsVisibleForClub(club.slug, event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing competition id' })

  const body = await readBody<{
    sportId?: string
    title?: string
    format?: string
    enrollmentType?: CompetitionEnrollmentType
    entryFee?: number
    prizeType?: CompetitionPrizeType
    prizeConfigJson?: string
    maxParticipants?: number
    minParticipants?: number
    registrationOpens?: string
    registrationCloses?: string
    eventAt?: string
    sponsorFunded?: boolean
    status?: CompetitionStatus
    publish?: boolean
    announce?: boolean
  }>(event)

  const patch: CompetitionUpdateInput = {}
  if (body.sportId !== undefined) patch.sportId = body.sportId
  if (body.title !== undefined) patch.title = body.title
  if (body.format !== undefined) patch.format = body.format
  if (body.enrollmentType !== undefined) patch.enrollmentType = body.enrollmentType
  if (body.entryFee !== undefined) patch.entryFee = Math.round(Number(body.entryFee))
  if (body.prizeType !== undefined) patch.prizeType = body.prizeType
  if (body.prizeConfigJson !== undefined) patch.prizeConfigJson = body.prizeConfigJson
  if (body.maxParticipants !== undefined) patch.maxParticipants = Math.round(Number(body.maxParticipants))
  if (body.minParticipants !== undefined) patch.minParticipants = Math.round(Number(body.minParticipants))
  if (body.registrationOpens !== undefined) patch.registrationOpens = new Date(body.registrationOpens)
  if (body.registrationCloses !== undefined) patch.registrationCloses = new Date(body.registrationCloses)
  if (body.eventAt !== undefined) patch.eventAt = new Date(body.eventAt)
  if (body.sponsorFunded !== undefined) patch.sponsorFunded = Boolean(body.sponsorFunded)
  if (body.publish) patch.status = 'OPEN'
  else if (body.status !== undefined) patch.status = body.status

  let calendarWarning = null
  if (body.eventAt) {
    const existing = await prisma.competition.findFirst({
      where: { id, clubId: club.id },
      select: { sportId: true },
    })
    if (existing) {
      const overlap = await checkEventCalendarOverlap(
        club.id,
        patch.sportId ?? existing.sportId,
        new Date(body.eventAt),
      )
      if (overlap.overlappingSlots > 0) {
        calendarWarning = {
          overlappingSlots: overlap.overlappingSlots,
          date: overlap.date,
          time: overlap.time,
        }
      }
    }
  }

  const competition = await updateCompetition({
    competitionId: id,
    clubId: club.id,
    patch,
  })

  if (body.announce && competition.status === 'OPEN') {
    await announceCompetitionToContacts({
      clubId: club.id,
      competitionTitle: competition.title,
    })
  }

  return { competition, calendarWarning }
})
