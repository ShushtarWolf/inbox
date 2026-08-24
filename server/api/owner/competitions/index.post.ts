import {
  announceCompetitionToContacts,
  assertCompetitionPublishable,
  checkEventCalendarOverlap,
  createCompetition,
  publishCompetition,
  type CompetitionCreateInput,
} from '../../../utils/competitions'
import { assertCompetitionsVisibleForClub } from '../../../utils/competitionsGate'
import { validatePrizeConfig, type CompetitionEnrollmentType, type CompetitionPrizeType } from '#shared/competition.ts'

function parseDate(raw: string | undefined, field: string): Date {
  if (!raw) throw createError({ statusCode: 400, statusMessage: `Missing ${field}` })
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${field}` })
  }
  return d
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  assertCompetitionsVisibleForClub(club.slug, event)
  const body = await readBody<{
    sportId?: string
    title?: string
    format?: string
    enrollmentType?: CompetitionEnrollmentType
    entryFee?: number
    prizeType?: CompetitionPrizeType
    prizeConfigJson?: string | { placements: unknown[] }
    maxParticipants?: number
    minParticipants?: number
    registrationOpens?: string
    registrationCloses?: string
    eventAt?: string
    sponsorFunded?: boolean
    publish?: boolean
    announce?: boolean
  }>(event)

  if (!body?.sportId || !body.title?.trim() || !body.format?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }
  if (!body.enrollmentType || !body.prizeType) {
    throw createError({ statusCode: 400, statusMessage: 'Missing enrollmentType or prizeType' })
  }

  const prizeConfigJson = typeof body.prizeConfigJson === 'string'
    ? body.prizeConfigJson
    : JSON.stringify(body.prizeConfigJson ?? { placements: [] })
  validatePrizeConfig(body.prizeType, prizeConfigJson)

  const input: CompetitionCreateInput = {
    clubId: club.id,
    sportId: body.sportId,
    title: body.title.trim(),
    format: body.format.trim(),
    enrollmentType: body.enrollmentType,
    entryFee: Math.round(Number(body.entryFee ?? 0)),
    prizeType: body.prizeType,
    prizeConfigJson,
    maxParticipants: Math.round(Number(body.maxParticipants ?? 0)),
    minParticipants: body.minParticipants != null ? Math.round(Number(body.minParticipants)) : undefined,
    registrationOpens: parseDate(body.registrationOpens, 'registrationOpens'),
    registrationCloses: parseDate(body.registrationCloses, 'registrationCloses'),
    eventAt: parseDate(body.eventAt, 'eventAt'),
    sponsorFunded: Boolean(body.sponsorFunded),
  }

  const calendarWarning = await checkEventCalendarOverlap(club.id, input.sportId, input.eventAt)

  let competition = await createCompetition(input)

  if (body.publish) {
    await assertCompetitionPublishable(club.id, input.sportId)
    competition = await publishCompetition(competition.id, club.id)
    if (body.announce) {
      await announceCompetitionToContacts({
        clubId: club.id,
        competitionTitle: competition.title,
      })
    }
  }

  return {
    competition,
    calendarWarning: calendarWarning.overlappingSlots > 0
      ? {
          overlappingSlots: calendarWarning.overlappingSlots,
          date: calendarWarning.date,
          time: calendarWarning.time,
        }
      : null,
    noCourts: !calendarWarning.hasCourts,
  }
})
