import type { Competition, CompetitionEntry, Payment, Prisma } from '@prisma/client'
import { localDateString, localTimeString } from '#shared/localDate.ts'
import { initialPlatformPaymentFields } from '#shared/bookingPayment.ts'
import {
  ACTIVE_ENTRY_STATUSES,
  assertCompetitionEntryFeeWithinCap,
  assertCompetitionStatusTransition,
  assertEntryStatusTransition,
  assertFreeEntryAllowed,
  canCancelCompetitionEntry,
  competitionJoinIdempotencyKey,
  competitionPrizeIdempotencyKey,
  competitionPrizeWalletNote,
  DISCOUNT_PRIZE_VALIDITY_DAYS,
  isCompetitionJoinable,
  isCompetitionPayAtClubAllowed,
  isCompetitionsVisibleForClub,
  isPaymentLinkedForEntryConfirm,
  PENDING_ENTRY_EXPIRY_MINUTES,
  validatePrizeConfig,
  type CompetitionPrizeType,
  type CompetitionStatus,
} from '#shared/competition.ts'
import { isUniqueConstraintError } from './prismaErrors'
import { notifyCompetitionCancelled } from './competitionNotify'
import { refundPaymentForCancellation } from './refunds'
import { createCompetitionPrizeDiscountCode } from './discountCodes'
import { creditWallet } from './wallet'
import { creditOwnerForPaidPayment } from './settlement'
import { prisma } from './prisma'

type DbClient = Prisma.TransactionClient | typeof prisma

export type CompetitionCreateInput = {
  clubId: string
  sportId: string
  title: string
  format: string
  enrollmentType: 'SINGLE' | 'DOUBLE'
  entryFee: number
  prizeType: CompetitionPrizeType
  prizeConfigJson: string
  maxParticipants: number
  minParticipants?: number
  registrationOpens: Date
  registrationCloses: Date
  eventAt: Date
  sponsorFunded?: boolean
}

export type CompetitionUpdateInput = Partial<Omit<CompetitionCreateInput, 'clubId'>> & {
  status?: CompetitionStatus
}

export type CalendarOverlapWarning = {
  overlappingSlots: number
  hasCourts: boolean
  date: string
  time: string
}

function parseDateField(raw: string | Date, field: string): Date {
  const d = raw instanceof Date ? raw : new Date(raw)
  if (Number.isNaN(d.getTime())) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${field}` })
  }
  return d
}

/** Count courts for a sport at a club — publish blocked when zero. */
export async function countCourtsForSport(clubId: string, sportId: string, client: DbClient = prisma) {
  return client.court.count({ where: { clubId, sportId } })
}

/** Read-only: warn when eventAt falls on a busy calendar slot for this sport. */
export async function checkEventCalendarOverlap(
  clubId: string,
  sportId: string,
  eventAt: Date,
): Promise<CalendarOverlapWarning> {
  const date = localDateString(eventAt)
  const time = localTimeString(eventAt)
  const courtCount = await countCourtsForSport(clubId, sportId)
  if (courtCount === 0) {
    return { overlappingSlots: 0, hasCourts: false, date, time }
  }

  const slots = await prisma.slot.findMany({
    where: {
      court: { clubId, sportId },
      date,
      displayStatus: { notIn: ['FREE', 'CANCELLED'] },
    },
    select: { startTime: true, endTime: true },
  })

  const eventMinutes = timeToMinutes(time)
  const overlapping = slots.filter((slot) => {
    const start = timeToMinutes(slot.startTime)
    const end = timeToMinutes(slot.endTime)
    return eventMinutes >= start && eventMinutes < end
  })

  return {
    overlappingSlots: overlapping.length,
    hasCourts: true,
    date,
    time,
  }
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export async function createCompetition(input: CompetitionCreateInput) {
  assertCompetitionDraftValid(input)

  return prisma.competition.create({
    data: {
      clubId: input.clubId,
      sportId: input.sportId,
      title: input.title.trim(),
      format: input.format.trim(),
      enrollmentType: input.enrollmentType,
      entryFee: Math.max(0, Math.round(input.entryFee)),
      prizeType: input.prizeType,
      prizeConfigJson: input.prizeConfigJson,
      maxParticipants: input.maxParticipants,
      minParticipants: input.minParticipants ?? 2,
      registrationOpens: input.registrationOpens,
      registrationCloses: input.registrationCloses,
      eventAt: input.eventAt,
      sponsorFunded: Boolean(input.sponsorFunded),
      status: 'DRAFT',
    },
  })
}

const DRAFT_EDITABLE: (keyof CompetitionUpdateInput)[] = [
  'sportId', 'title', 'format', 'enrollmentType', 'entryFee', 'prizeType',
  'prizeConfigJson', 'maxParticipants', 'minParticipants',
  'registrationOpens', 'registrationCloses', 'eventAt', 'sponsorFunded', 'status',
]

const OPEN_EDITABLE: (keyof CompetitionUpdateInput)[] = [
  'title', 'format', 'maxParticipants', 'minParticipants', 'registrationCloses', 'status',
]

const CLOSED_EDITABLE: (keyof CompetitionUpdateInput)[] = ['title', 'status']
const IN_PROGRESS_EDITABLE: (keyof CompetitionUpdateInput)[] = ['title', 'status']

function editableFieldsForStatus(status: CompetitionStatus): (keyof CompetitionUpdateInput)[] {
  switch (status) {
    case 'DRAFT': return DRAFT_EDITABLE
    case 'OPEN': return OPEN_EDITABLE
    case 'CLOSED': return CLOSED_EDITABLE
    case 'IN_PROGRESS': return IN_PROGRESS_EDITABLE
    default: return []
  }
}

export async function updateCompetition(opts: {
  competitionId: string
  clubId: string
  patch: CompetitionUpdateInput
}) {
  const competition = await prisma.competition.findFirst({
    where: { id: opts.competitionId, clubId: opts.clubId },
  })
  if (!competition) {
    throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
  }

  const allowed = editableFieldsForStatus(competition.status)
  if (allowed.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'Competition is not editable' })
  }

  const data: Prisma.CompetitionUpdateInput = {}
  const patch = opts.patch

  for (const key of Object.keys(patch) as (keyof CompetitionUpdateInput)[]) {
    if (patch[key] === undefined) continue
    if (!allowed.includes(key)) {
      throw createError({ statusCode: 409, statusMessage: `Field ${key} not editable in ${competition.status}` })
    }
  }

  if (patch.title !== undefined) data.title = patch.title.trim()
  if (patch.format !== undefined) data.format = patch.format.trim()
  if (patch.enrollmentType !== undefined) data.enrollmentType = patch.enrollmentType
  if (patch.sportId !== undefined) data.sport = { connect: { id: patch.sportId } }
  if (patch.prizeType !== undefined) data.prizeType = patch.prizeType
  if (patch.sponsorFunded !== undefined) data.sponsorFunded = Boolean(patch.sponsorFunded)

  const confirmedCount = await countConfirmedEntries(competition.id)

  if (patch.entryFee !== undefined) {
    if (competition.status === 'OPEN' && confirmedCount > 0) {
      throw createError({ statusCode: 409, statusMessage: 'ENTRY_FEE_LOCKED' })
    }
    data.entryFee = Math.max(0, Math.round(patch.entryFee))
  }

  if (patch.maxParticipants !== undefined) {
    const max = Math.round(patch.maxParticipants)
    if (max < 1) {
      throw createError({ statusCode: 400, statusMessage: 'maxParticipants must be positive' })
    }
    if (max < confirmedCount) {
      throw createError({ statusCode: 409, statusMessage: 'MAX_BELOW_CONFIRMED' })
    }
    data.maxParticipants = max
  }

  if (patch.minParticipants !== undefined) {
    const min = Math.round(patch.minParticipants)
    const max = patch.maxParticipants ?? competition.maxParticipants
    if (min < 1 || min > max) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid minParticipants' })
    }
    data.minParticipants = min
  }

  if (patch.prizeConfigJson !== undefined) {
    validatePrizeConfig(patch.prizeType ?? competition.prizeType, patch.prizeConfigJson)
    data.prizeConfigJson = patch.prizeConfigJson
  }
  else if (patch.prizeType !== undefined && patch.prizeType !== competition.prizeType) {
    // Switching WALLET ↔ DISCOUNT must still validate the stored config shape.
    validatePrizeConfig(patch.prizeType, competition.prizeConfigJson)
  }

  if (patch.registrationOpens !== undefined) {
    data.registrationOpens = parseDateField(patch.registrationOpens, 'registrationOpens')
  }
  if (patch.registrationCloses !== undefined) {
    data.registrationCloses = parseDateField(patch.registrationCloses, 'registrationCloses')
  }
  if (patch.eventAt !== undefined) {
    data.eventAt = parseDateField(patch.eventAt, 'eventAt')
  }

  const nextOpens = (data.registrationOpens as Date | undefined) ?? competition.registrationOpens
  const nextCloses = (data.registrationCloses as Date | undefined) ?? competition.registrationCloses
  const nextEventAt = (data.eventAt as Date | undefined) ?? competition.eventAt
  if (nextCloses < nextOpens) {
    throw createError({ statusCode: 400, statusMessage: 'registrationCloses before registrationOpens' })
  }
  if (nextEventAt < nextCloses) {
    throw createError({ statusCode: 400, statusMessage: 'eventAt before registrationCloses' })
  }

  const nextEntryFee = (data.entryFee as number | undefined) ?? competition.entryFee
  const nextSponsorFunded = (data.sponsorFunded as boolean | undefined) ?? competition.sponsorFunded
  assertFreeEntryAllowed(nextEntryFee, nextSponsorFunded)
  try {
    assertCompetitionEntryFeeWithinCap(nextEntryFee)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'ENTRY_FEE_TOO_HIGH' })
  }

  if (patch.status === 'OPEN' && competition.status === 'DRAFT') {
    await assertCompetitionPublishable(competition.clubId, patch.sportId ?? competition.sportId)
    assertCompetitionStatusTransition('DRAFT', 'OPEN')
    data.status = 'OPEN'
  } else if (patch.status !== undefined && patch.status !== competition.status) {
    assertCompetitionStatusTransition(competition.status, patch.status)
    data.status = patch.status
  }

  return prisma.competition.update({
    where: { id: competition.id },
    data,
  })
}

export async function assertCompetitionPublishable(clubId: string, sportId: string) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { slug: true },
  })
  if (!club) {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }
  if (!isCompetitionsVisibleForClub(club.slug)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const courtCount = await countCourtsForSport(clubId, sportId)
  if (courtCount === 0) {
    throw createError({ statusCode: 409, statusMessage: 'NO_COURTS_FOR_SPORT' })
  }
}

export async function publishCompetition(competitionId: string, clubId: string) {
  const competition = await prisma.competition.findFirst({
    where: { id: competitionId, clubId },
  })
  if (!competition) {
    throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
  }
  await assertCompetitionPublishable(clubId, competition.sportId)
  return transitionCompetitionStatus({ competitionId, toStatus: 'OPEN' })
}

export async function completeCompetition(competitionId: string) {
  return prisma.$transaction(async (tx) => {
    await lockCompetitionRow(tx, competitionId)
    const competition = await tx.competition.findUnique({ where: { id: competitionId } })
    if (!competition) {
      throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
    }

    let status = competition.status
    if (status === 'CLOSED') {
      assertCompetitionStatusTransition(status, 'IN_PROGRESS')
      await tx.competition.update({ where: { id: competitionId }, data: { status: 'IN_PROGRESS' } })
      status = 'IN_PROGRESS'
    }

    assertCompetitionStatusTransition(status, 'COMPLETED')
    return tx.competition.update({
      where: { id: competitionId },
      data: { status: 'COMPLETED' },
    })
  })
}

export type PrizeAwardAudit = {
  winnerEntryIds: Record<string, string>
  discountCodeIds?: string[]
  awardIds?: string[]
}

export type PrizeAwardResult = {
  competition: Competition
  awards: Array<{
    id: string
    placement: number
    entryId: string
    athleteId: string
    prizeType: CompetitionPrizeType
    amount?: number | null
    percent?: number | null
    discountCode?: string | null
    skipped: boolean
  }>
  audit: PrizeAwardAudit
}

/**
 * Doubles prize policy (Phase 1): credit/discount goes to the primary registrant
 * (`entry.athleteId`) only — partners do not receive a split.
 */
function prizeRecipientAthleteId(entry: CompetitionEntry) {
  return entry.athleteId
}

function discountPrizeEndsAt(eventAt: Date, now = new Date()) {
  const base = new Date(eventAt)
  base.setDate(base.getDate() + DISCOUNT_PRIZE_VALIDITY_DAYS)
  return base > now ? base : new Date(now.getTime() + DISCOUNT_PRIZE_VALIDITY_DAYS * 86400000)
}

export type PlacementInput = { entryId: string; placement: number | null }

/** Owner records finish ranks on CONFIRMED entries before payout. */
export async function recordCompetitionPlacements(opts: {
  competitionId: string
  clubId: string
  placements: PlacementInput[]
}) {
  const competition = await prisma.competition.findFirst({
    where: { id: opts.competitionId, clubId: opts.clubId },
  })
  if (!competition) {
    throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
  }
  if (competition.prizesAwardedAt) {
    throw createError({ statusCode: 409, statusMessage: 'Prizes already awarded' })
  }
  if (!['CLOSED', 'IN_PROGRESS', 'COMPLETED'].includes(competition.status)) {
    throw createError({ statusCode: 409, statusMessage: 'Competition not ready for placements' })
  }

  const prizeConfig = validatePrizeConfig(competition.prizeType, competition.prizeConfigJson)
  const allowedPlacements = new Set(prizeConfig.placements.map((p) => p.placement))
  const seenPlacements = new Set<number>()
  const seenEntries = new Set<string>()

  for (const row of opts.placements) {
    if (row.placement == null) continue
    const placement = Math.round(Number(row.placement))
    if (!Number.isInteger(placement) || placement < 1) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid placement' })
    }
    if (!allowedPlacements.has(placement)) {
      throw createError({ statusCode: 400, statusMessage: `Placement ${placement} not configured` })
    }
    if (seenPlacements.has(placement)) {
      throw createError({ statusCode: 409, statusMessage: `Duplicate placement ${placement}` })
    }
    if (seenEntries.has(row.entryId)) {
      throw createError({ statusCode: 409, statusMessage: 'Duplicate entry in placements' })
    }
    seenPlacements.add(placement)
    seenEntries.add(row.entryId)
  }

  return prisma.$transaction(async (tx) => {
    await lockCompetitionRow(tx, opts.competitionId)

    await tx.competitionEntry.updateMany({
      where: { competitionId: opts.competitionId },
      data: { placement: null },
    })

    for (const row of opts.placements) {
      if (row.placement == null) continue
      const entry = await tx.competitionEntry.findFirst({
        where: {
          id: row.entryId,
          competitionId: opts.competitionId,
          status: 'CONFIRMED',
        },
      })
      if (!entry) {
        throw createError({ statusCode: 404, statusMessage: `Confirmed entry not found: ${row.entryId}` })
      }
      await tx.competitionEntry.update({
        where: { id: entry.id },
        data: { placement: Math.round(Number(row.placement)) },
      })
    }

    return tx.competitionEntry.findMany({
      where: { competitionId: opts.competitionId, placement: { not: null } },
      select: { id: true, placement: true, athleteId: true, status: true },
      orderBy: { placement: 'asc' },
    })
  })
}

/** Idempotent prize payout from owner-recorded entry placements. */
export async function awardCompetitionPrizes(competitionId: string): Promise<PrizeAwardResult> {
  return prisma.$transaction(async (tx) => {
    await lockCompetitionRow(tx, competitionId)
    const competition = await tx.competition.findUniqueOrThrow({
      where: { id: competitionId },
      include: { club: true },
    })

    if (competition.status !== 'COMPLETED') {
      throw createError({ statusCode: 409, statusMessage: 'Competition must be COMPLETED before awarding prizes' })
    }

    const prizeConfig = validatePrizeConfig(competition.prizeType, competition.prizeConfigJson)
    const placedEntries = await tx.competitionEntry.findMany({
      where: {
        competitionId,
        status: 'CONFIRMED',
        placement: { not: null },
      },
      orderBy: { placement: 'asc' },
    })

    if (!placedEntries.length) {
      throw createError({ statusCode: 400, statusMessage: 'No placements recorded on entries' })
    }

    for (const configured of prizeConfig.placements) {
      const winner = placedEntries.find((e) => e.placement === configured.placement)
      if (!winner) {
        throw createError({
          statusCode: 400,
          statusMessage: `Missing winner for placement ${configured.placement}`,
        })
      }
    }

    const placementSet = new Set<number>()
    for (const entry of placedEntries) {
      if (entry.placement == null) continue
      if (placementSet.has(entry.placement)) {
        throw createError({ statusCode: 409, statusMessage: `Duplicate placement ${entry.placement}` })
      }
      placementSet.add(entry.placement)
      if (!prizeConfig.placements.some((p) => p.placement === entry.placement)) {
        throw createError({ statusCode: 400, statusMessage: `Unexpected placement ${entry.placement}` })
      }
    }

    const winnerEntryIds: Record<string, string> = {}
    const discountCodeIds: string[] = []
    const awardIds: string[] = []
    const awards: PrizeAwardResult['awards'] = []

    for (const entry of placedEntries) {
      const placement = entry.placement!
      const placementConfig = prizeConfig.placements.find((p) => p.placement === placement)!
      const athleteId = prizeRecipientAthleteId(entry)
      const idempotencyKey = competitionPrizeIdempotencyKey(competitionId, entry.id, placement)

      const existing = await tx.competitionPrizeAward.findUnique({ where: { idempotencyKey } })
      if (existing) {
        winnerEntryIds[String(placement)] = entry.id
        awardIds.push(existing.id)
        let discountCode: string | null = null
        if (existing.discountCodeId) {
          const codeRow = await tx.discountCode.findUnique({ where: { id: existing.discountCodeId } })
          discountCode = codeRow?.code ?? null
          if (existing.discountCodeId) discountCodeIds.push(existing.discountCodeId)
        }
        awards.push({
          id: existing.id,
          placement,
          entryId: entry.id,
          athleteId,
          prizeType: existing.prizeType,
          amount: existing.amount,
          percent: existing.percent,
          discountCode,
          skipped: true,
        })
        continue
      }

      let walletTransactionId: string | null = null
      let discountCodeId: string | null = null
      let discountCode: string | null = null
      let amount: number | null = null
      let percent: number | null = null

      if (competition.prizeType === 'WALLET') {
        amount = placementConfig.amount!
        const note = competitionPrizeWalletNote(competitionId, placement)
        const priorTx = await tx.walletTransaction.findFirst({
          where: { note, wallet: { userId: athleteId } },
        })
        if (!priorTx) {
          const wallet = await creditWallet(athleteId, amount, {
            type: 'ADJUSTMENT',
            note,
          }, tx)
          const createdTx = await tx.walletTransaction.findFirst({
            where: { walletId: wallet.id, note },
            orderBy: { createdAt: 'desc' },
          })
          walletTransactionId = createdTx?.id ?? null
        } else {
          walletTransactionId = priorTx.id
        }
      } else {
        percent = placementConfig.percent!
        const discount = await createCompetitionPrizeDiscountCode(tx, {
          competitionId,
          placement,
          percent,
          clubId: competition.clubId,
          athleteId,
          title: competition.title,
          endsAt: discountPrizeEndsAt(competition.eventAt),
        })
        discountCodeId = discount.id
        discountCode = discount.code
        discountCodeIds.push(discount.id)
      }

      let award
      try {
        award = await tx.competitionPrizeAward.create({
          data: {
            competitionId,
            entryId: entry.id,
            placement,
            athleteId,
            prizeType: competition.prizeType,
            amount,
            percent,
            idempotencyKey,
            walletTransactionId,
            discountCodeId,
          },
        })
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const raced = await tx.competitionPrizeAward.findUniqueOrThrow({ where: { idempotencyKey } })
          awardIds.push(raced.id)
          winnerEntryIds[String(placement)] = entry.id
          awards.push({
            id: raced.id,
            placement,
            entryId: entry.id,
            athleteId,
            prizeType: raced.prizeType,
            amount: raced.amount,
            percent: raced.percent,
            discountCode: null,
            skipped: true,
          })
          continue
        }
        throw error
      }

      winnerEntryIds[String(placement)] = entry.id
      awardIds.push(award.id)
      awards.push({
        id: award.id,
        placement,
        entryId: entry.id,
        athleteId,
        prizeType: award.prizeType,
        amount,
        percent,
        discountCode,
        skipped: false,
      })
    }

    const audit: PrizeAwardAudit = {
      winnerEntryIds,
      ...(discountCodeIds.length ? { discountCodeIds } : {}),
      awardIds,
    }

    const updated = await tx.competition.update({
      where: { id: competition.id },
      data: {
        prizesAwardedAt: competition.prizesAwardedAt ?? new Date(),
        prizeAwardAuditJson: JSON.stringify(audit),
      },
    })

    return { competition: updated, awards, audit }
  })
}

/** Refund all CONFIRMED entries after competition cancel (owner/system — no cancellation window). */
async function refundConfirmedEntries(
  competitionId: string,
  cancelledBy: string,
  reason: string,
) {
  const entries = await prisma.competitionEntry.findMany({
    where: { competitionId, status: 'CONFIRMED' },
    include: { payment: true },
  })

  const now = new Date()
  for (const entry of entries) {
    if (entry.payment?.status === 'PAID') {
      await refundPaymentForCancellation({
        paymentId: entry.payment.id,
        userId: entry.athleteId,
        reason,
      })
      await prisma.competitionEntry.update({
        where: { id: entry.id },
        data: {
          status: 'REFUNDED',
          cancelledAt: now,
          cancelledBy,
          cancelReason: reason,
        },
      })
    } else {
      await prisma.competitionEntry.update({
        where: { id: entry.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy,
          cancelReason: reason,
        },
      })
    }
  }
}

/** Close OPEN competitions past registrationCloses; auto-cancel when below minParticipants. */
export async function processCompetitionsPastRegistrationClose(now = new Date()) {
  const due = await prisma.competition.findMany({
    where: {
      status: 'OPEN',
      registrationCloses: { lte: now },
      cancelledAt: null,
    },
  })

  let closed = 0
  let cancelled = 0

  for (const competition of due) {
    await transitionCompetitionStatus({ competitionId: competition.id, toStatus: 'CLOSED' })
    closed++

    const confirmedCount = await countConfirmedEntries(competition.id)
    if (confirmedCount < competition.minParticipants) {
      await cancelCompetition({
        competitionId: competition.id,
        cancelledBy: 'system',
        cancelReason: 'حداقل تعداد شرکت‌کنندگان تأمین نشد — ثبت‌نام‌ها استرداد می‌شود.',
        refundEntries: true,
      })
      cancelled++
    }
  }

  return { closed, cancelled }
}

/** Optional CRM SMS campaign when publishing — default off; respects consentSms. */
export async function announceCompetitionToContacts(opts: {
  clubId: string
  competitionTitle: string
  message?: string
}) {
  const contacts = await prisma.contact.findMany({
    where: { clubId: opts.clubId, consentSms: true },
    select: { id: true, mobile: true },
  })
  const recipients = contacts.filter((c) => c.mobile)
  if (!recipients.length) return { campaign: null, recipientCount: 0 }

  const template = opts.message
    || `مسابقه جدید: ${opts.competitionTitle}. جزئیات و ثبت‌نام در اینباکس.`

  const campaign = await prisma.campaign.create({
    data: {
      clubId: opts.clubId,
      name: `اعلام مسابقه: ${opts.competitionTitle}`,
      channel: 'SMS',
      template,
      status: 'DRAFT',
    },
  })

  await prisma.campaignRecipient.createMany({
    data: recipients.map((c) => ({
      campaignId: campaign.id,
      contactId: c.id,
      status: 'PENDING',
    })),
  })

  return { campaign, recipientCount: recipients.length }
}

/** Row-lock competition inside an open transaction to serialize seat claims. */
export async function lockCompetitionRow(tx: Prisma.TransactionClient, competitionId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Competition" WHERE id = ${competitionId} FOR UPDATE
  `
  if (rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
  }
}

export async function countConfirmedEntries(
  competitionId: string,
  client: DbClient = prisma,
): Promise<number> {
  return client.competitionEntry.count({
    where: { competitionId, status: 'CONFIRMED' },
  })
}

export async function countActiveEntries(
  competitionId: string,
  client: DbClient = prisma,
): Promise<number> {
  return client.competitionEntry.count({
    where: {
      competitionId,
      status: { in: [...ACTIVE_ENTRY_STATUSES] },
    },
  })
}

export function assertCompetitionJoinable(
  competition: Competition,
  activeEntryCount: number,
  now = new Date(),
) {
  if (competition.cancelledAt) {
    throw createError({ statusCode: 409, statusMessage: 'COMPETITION_CANCELLED' })
  }
  if (!isCompetitionJoinable(competition, now)) {
    throw createError({ statusCode: 409, statusMessage: 'COMPETITION_NOT_JOINABLE' })
  }
  if (activeEntryCount >= competition.maxParticipants) {
    throw createError({ statusCode: 409, statusMessage: 'COMPETITION_FULL' })
  }
}

export function assertCompetitionDraftValid(input: CompetitionCreateInput) {
  assertFreeEntryAllowed(input.entryFee, Boolean(input.sponsorFunded))
  try {
    assertCompetitionEntryFeeWithinCap(input.entryFee)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'ENTRY_FEE_TOO_HIGH' })
  }
  validatePrizeConfig(input.prizeType, input.prizeConfigJson)
  if (input.maxParticipants < 1) {
    throw createError({ statusCode: 400, statusMessage: 'maxParticipants must be positive' })
  }
  const min = input.minParticipants ?? 2
  if (min < 1 || min > input.maxParticipants) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid minParticipants' })
  }
  if (input.registrationCloses < input.registrationOpens) {
    throw createError({ statusCode: 400, statusMessage: 'registrationCloses before registrationOpens' })
  }
  if (input.eventAt < input.registrationCloses) {
    throw createError({ statusCode: 400, statusMessage: 'eventAt before registrationCloses' })
  }
}

async function assertAthleteNotInActiveEntry(
  tx: Prisma.TransactionClient,
  competitionId: string,
  athleteId: string,
) {
  const existing = await tx.competitionEntry.findFirst({
    where: {
      competitionId,
      status: { in: [...ACTIVE_ENTRY_STATUSES] },
      OR: [{ athleteId }, { partnerAthleteId: athleteId }],
    },
    select: { id: true },
  })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'ALREADY_REGISTERED' })
  }
}

function assertDoublesEnrollment(
  competition: Competition,
  partnerAthleteId: string | null | undefined,
  athleteId: string,
) {
  if (competition.enrollmentType === 'DOUBLE') {
    if (!partnerAthleteId) {
      throw createError({ statusCode: 400, statusMessage: 'Partner required for doubles' })
    }
    if (partnerAthleteId === athleteId) {
      throw createError({ statusCode: 400, statusMessage: 'Athlete and partner must differ' })
    }
    return
  }
  if (partnerAthleteId) {
    throw createError({ statusCode: 400, statusMessage: 'Partner not allowed for singles' })
  }
}

export async function findActiveEntry(
  competitionId: string,
  athleteId: string,
  client: DbClient = prisma,
) {
  return client.competitionEntry.findFirst({
    where: {
      competitionId,
      status: { in: [...ACTIVE_ENTRY_STATUSES] },
      OR: [{ athleteId }, { partnerAthleteId: athleteId }],
    },
    include: { payment: true, competition: true },
  })
}

async function linkCompetitionPayment(
  tx: Prisma.TransactionClient,
  opts: {
    entryId: string
    competitionId: string
    athleteId: string
    amount: number
    method: Payment['method']
    status: Payment['status']
    provider?: string
  },
) {
  // Entry-scoped key so cancel→rejoin never fights the previous entry's @unique paymentId.
  const idempotencyKey = competitionJoinIdempotencyKey(
    opts.competitionId,
    opts.athleteId,
    opts.entryId,
  )
  const existing = await tx.payment.findUnique({ where: { idempotencyKey } })
  if (existing) {
    await tx.competitionEntry.update({
      where: { id: opts.entryId },
      data: { paymentId: existing.id },
    })
    return existing
  }

  const payment = await tx.payment.create({
    data: {
      amount: opts.amount,
      method: opts.method,
      status: opts.status,
      provider: opts.provider || 'pay_at_club',
      userId: opts.athleteId,
      purpose: 'competition',
      idempotencyKey,
      metadataJson: JSON.stringify({
        competitionEntryId: opts.entryId,
        competitionId: opts.competitionId,
      }),
    },
  })
  await tx.competitionEntry.update({
    where: { id: opts.entryId },
    data: { paymentId: payment.id },
  })
  return payment
}

export async function joinCompetition(opts: {
  competitionId: string
  athleteId: string
  partnerAthleteId?: string | null
  payAtClub?: boolean
}) {
  const existing = await findActiveEntry(opts.competitionId, opts.athleteId)
  if (existing) {
    return { entry: existing, payment: existing.payment, created: false as const }
  }

  const entry = await createPendingEntry({
    competitionId: opts.competitionId,
    athleteId: opts.athleteId,
    partnerAthleteId: opts.partnerAthleteId,
  })

  const competition = await prisma.competition.findUniqueOrThrow({
    where: { id: opts.competitionId },
  })

  if (competition.entryFee <= 0) {
    const confirmed = await confirmEntry({ entryId: entry.id })
    return { entry: confirmed, payment: null, created: true as const }
  }

  if (opts.payAtClub) {
    if (!isCompetitionPayAtClubAllowed()) {
      throw createError({ statusCode: 400, statusMessage: 'PAY_AT_CLUB_NOT_ALLOWED' })
    }
    const payment = await prisma.$transaction(async (tx) => {
      return linkCompetitionPayment(tx, {
        entryId: entry.id,
        competitionId: competition.id,
        athleteId: opts.athleteId,
        amount: competition.entryFee,
        method: 'CASH',
        status: 'PAY_AT_CLUB',
        provider: 'pay_at_club',
      })
    })
    const hydrated = await prisma.competitionEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { payment: true, competition: true },
    })
    return { entry: hydrated, payment, created: true as const }
  }

  const platformFields = initialPlatformPaymentFields(competition.entryFee)
  const payment = await prisma.$transaction(async (tx) => {
    return linkCompetitionPayment(tx, {
      entryId: entry.id,
      competitionId: competition.id,
      athleteId: opts.athleteId,
      amount: competition.entryFee,
      method: platformFields.payment.method,
      status: platformFields.payment.status,
      provider: platformFields.payment.provider,
    })
  })

  const hydrated = await prisma.competitionEntry.findUniqueOrThrow({
    where: { id: entry.id },
    include: { payment: true, competition: true },
  })
  return { entry: hydrated, payment, created: true as const }
}

const DESK_UNPAID_PAYMENT_STATUSES = new Set(['PAY_AT_CLUB', 'PENDING_AT_CLUB'])

/** Owner desk flow: mark pay-at-club payment settled, then confirm entry idempotently. */
export async function markCompetitionEntryPaid(opts: {
  competitionId: string
  entryId: string
  clubId: string
  actorUserId?: string | null
}): Promise<CompetitionEntry> {
  const entry = await prisma.competitionEntry.findUnique({
    where: { id: opts.entryId },
    include: { competition: true, payment: true },
  })

  if (!entry || entry.competitionId !== opts.competitionId || entry.competition.clubId !== opts.clubId) {
    throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
  }

  if (entry.status === 'CONFIRMED') {
    throw createError({ statusCode: 409, statusMessage: 'Entry already confirmed' })
  }
  if (entry.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: 'Invalid entry status' })
  }

  const { entryFee } = entry.competition
  if (entryFee > 0 && (!entry.paymentId || !entry.payment)) {
    throw createError({ statusCode: 400, statusMessage: 'Payment required' })
  }

  const payment = entry.payment
  if (payment) {
    if (payment.status === 'PAID') {
      // Settle if a prior competition PAID never created a ledger row (idempotent).
      await creditOwnerForPaidPayment(payment.id)
      return confirmEntry({
        entryId: entry.id,
        paymentId: payment.id,
        actorUserId: opts.actorUserId,
      })
    }
    if (!DESK_UNPAID_PAYMENT_STATUSES.has(payment.status)) {
      throw createError({ statusCode: 409, statusMessage: 'Payment not awaiting desk confirmation' })
    }

    const previousStatus = payment.status
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        method: 'CASH',
        provider: payment.provider || 'pay_at_club',
      },
    })
    await creditOwnerForPaidPayment(payment.id, previousStatus)

    return confirmEntry({
      entryId: entry.id,
      paymentId: payment.id,
      actorUserId: opts.actorUserId,
    })
  }

  if (entryFee <= 0) {
    return confirmEntry({ entryId: entry.id, actorUserId: opts.actorUserId })
  }

  throw createError({ statusCode: 400, statusMessage: 'Payment required' })
}

/** Idempotent: confirm PENDING entry when its payment settles (wallet / IPG / owner mark-paid). */
export async function confirmEntryFromPayment(paymentId: string): Promise<CompetitionEntry | null> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { competitionEntry: { include: { competition: true } } },
  })
  if (!payment) return null

  let entry = payment.competitionEntry

  if (!entry) {
    entry = await resolveCompetitionEntryForPayment(payment)
  }

  if (!entry) return null
  if (entry.status === 'CONFIRMED') return entry
  if (entry.status !== 'PENDING') return null
  if (!isPaymentLinkedForEntryConfirm(payment, entry.competition.entryFee)) return null
  return confirmEntry({ entryId: entry.id, paymentId: payment.id })
}

function parsePaymentMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Fallback when entry.paymentId points at a stale row — metadata still carries competitionEntryId. */
async function resolveCompetitionEntryForPayment(
  payment: Payment & { competitionEntry?: (CompetitionEntry & { competition: Competition }) | null },
) {
  const meta = parsePaymentMetadata(payment.metadataJson)
  const entryId = typeof meta.competitionEntryId === 'string' ? meta.competitionEntryId : null
  if (!entryId || !payment.userId) return null

  const candidate = await prisma.competitionEntry.findUnique({
    where: { id: entryId },
    include: { competition: true },
  })
  if (!candidate || candidate.status !== 'PENDING' || candidate.athleteId !== payment.userId) {
    return null
  }

  if (candidate.paymentId !== payment.id) {
    await prisma.competitionEntry.update({
      where: { id: candidate.id },
      data: { paymentId: payment.id },
    })
    return { ...candidate, paymentId: payment.id }
  }

  return candidate
}

/**
 * Competition IPG settled after cancel/expire (entry paymentId often nulled).
 * Caller must verify-then-refund — never revive CANCELLED/REFUNDED entries or settle the club.
 */
export async function findCompetitionLatePayTarget(payment: {
  purpose: string | null
  userId: string | null
  metadataJson: string | null
  competitionEntry?: { id: string; status: string; athleteId: string } | null
}): Promise<{ entryId: string | null; userId: string | null } | null> {
  if (payment.purpose !== 'competition') return null

  let entry = payment.competitionEntry ?? null
  if (!entry) {
    const meta = parsePaymentMetadata(payment.metadataJson)
    const entryId = typeof meta.competitionEntryId === 'string' ? meta.competitionEntryId : null
    if (entryId) {
      entry = await prisma.competitionEntry.findUnique({
        where: { id: entryId },
        select: { id: true, status: true, athleteId: true },
      })
    }
  }

  if (!entry) {
    return { entryId: null, userId: payment.userId }
  }

  if (entry.status === 'PENDING' || entry.status === 'CONFIRMED') {
    return null
  }

  return {
    entryId: entry.id,
    userId: payment.userId || entry.athleteId,
  }
}

export async function cancelCompetitionEntry(opts: {
  entryId: string
  athleteId: string
  reason?: string | null
}) {
  const entry = await prisma.competitionEntry.findUnique({
    where: { id: opts.entryId },
    include: {
      competition: { include: { club: true } },
      payment: true,
    },
  })
  if (!entry || (entry.athleteId !== opts.athleteId && entry.partnerAthleteId !== opts.athleteId)) {
    throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
  }
  if (entry.status === 'CANCELLED' || entry.status === 'REFUNDED') {
    return { entry, refund: null, refundPending: false }
  }

  if (!canCancelCompetitionEntry(
    entry.competition.eventAt,
    entry.competition.club.cancellationWindowHours,
  )) {
    throw createError({ statusCode: 409, statusMessage: 'CANCELLATION_WINDOW_PASSED' })
  }

  const now = new Date()
  const cancelData = {
    cancelledAt: now,
    cancelledBy: opts.athleteId,
    cancelReason: opts.reason ?? null,
  }

  if (entry.status === 'PENDING') {
    const updated = await prisma.competitionEntry.update({
      where: { id: entry.id },
      data: { status: 'CANCELLED', paymentId: null, ...cancelData },
    })
    return { entry: updated, refund: null, refundPending: false }
  }

  if (entry.status === 'CONFIRMED' && entry.payment?.status === 'PAID') {
    const refundResult = await refundPaymentForCancellation({
      paymentId: entry.payment.id,
      userId: entry.athleteId,
      reason: opts.reason || 'Competition entry cancelled',
    })

    // IPG reverse failed and wallet fallback also failed — ops must reverse manually in SEP.
    const refundPending = !refundResult.gatewayRefunded && !refundResult.walletCredited
    if (refundPending) {
      const meta = entry.payment.metadataJson
        ? JSON.parse(entry.payment.metadataJson) as Record<string, unknown>
        : {}
      await prisma.payment.update({
        where: { id: entry.payment.id },
        data: {
          metadataJson: JSON.stringify({
            ...meta,
            refundPending: true,
            refundPendingAt: now.toISOString(),
          }),
        },
      })
    }

    const updated = await prisma.competitionEntry.update({
      where: { id: entry.id },
      data: { status: 'REFUNDED', paymentId: null, ...cancelData },
    })
    return { entry: updated, refund: refundResult, refundPending }
  }

  const updated = await prisma.competitionEntry.update({
    where: { id: entry.id },
    data: { status: 'CANCELLED', paymentId: null, ...cancelData },
  })
  return { entry: updated, refund: null, refundPending: false }
}

/** Cancel stale PENDING entries whose payment never settled — releases reserved seats. */
export async function expireStalePendingEntries(now = new Date()) {
  const cutoff = new Date(now.getTime() - PENDING_ENTRY_EXPIRY_MINUTES * 60 * 1000)
  const stale = await prisma.competitionEntry.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
    },
    include: { payment: true },
  })

  let expired = 0
  for (const entry of stale) {
    if (entry.payment?.status === 'PAID') continue
    await prisma.competitionEntry.update({
      where: { id: entry.id },
      data: {
        status: 'CANCELLED',
        paymentId: null,
        cancelledAt: now,
        cancelReason: 'Payment timeout',
      },
    })
    if (entry.payment && ['PENDING_ONLINE', 'FAILED'].includes(entry.payment.status)) {
      await prisma.payment.update({
        where: { id: entry.payment.id },
        data: { status: 'FAILED' },
      })
    }
    expired++
  }
  return { expired }
}

export async function createPendingEntry(opts: {
  competitionId: string
  athleteId: string
  partnerAthleteId?: string | null
}) {
  return prisma.$transaction(async (tx) => {
    await lockCompetitionRow(tx, opts.competitionId)
    const competition = await tx.competition.findUnique({ where: { id: opts.competitionId } })
    if (!competition) {
      throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
    }

    assertDoublesEnrollment(competition, opts.partnerAthleteId, opts.athleteId)

    const activeCount = await countActiveEntries(opts.competitionId, tx)
    assertCompetitionJoinable(competition, activeCount)

    await assertAthleteNotInActiveEntry(tx, opts.competitionId, opts.athleteId)
    if (opts.partnerAthleteId) {
      await assertAthleteNotInActiveEntry(tx, opts.competitionId, opts.partnerAthleteId)
    }

    try {
      return await tx.competitionEntry.create({
        data: {
          competitionId: opts.competitionId,
          athleteId: opts.athleteId,
          partnerAthleteId: opts.partnerAthleteId ?? null,
          status: 'PENDING',
        },
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw createError({ statusCode: 409, statusMessage: 'ALREADY_REGISTERED' })
      }
      throw error
    }
  })
}

export async function confirmEntry(opts: {
  entryId: string
  paymentId?: string | null
  actorUserId?: string | null
}): Promise<CompetitionEntry> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.competitionEntry.findUnique({
      where: { id: opts.entryId },
      include: { competition: true, payment: true },
    })
    if (!entry) {
      throw createError({ statusCode: 404, statusMessage: 'Entry not found' })
    }

    assertEntryStatusTransition(entry.status, 'CONFIRMED')

    const { competition } = entry
    const entryFee = competition.entryFee

    if (entryFee > 0) {
      const paymentId = opts.paymentId ?? entry.paymentId
      if (!paymentId) {
        throw createError({ statusCode: 400, statusMessage: 'Payment required' })
      }
      const payment = paymentId === entry.paymentId && entry.payment
        ? entry.payment
        : await tx.payment.findUnique({ where: { id: paymentId } })
      if (!isPaymentLinkedForEntryConfirm(payment, entryFee)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid payment for entry' })
      }
      if (payment && entry.paymentId && entry.paymentId !== payment.id) {
        throw createError({ statusCode: 409, statusMessage: 'Entry already linked to another payment' })
      }

      return tx.competitionEntry.update({
        where: { id: entry.id },
        data: {
          status: 'CONFIRMED',
          paymentId: payment!.id,
        },
      })
    }

    return tx.competitionEntry.update({
      where: { id: entry.id },
      data: { status: 'CONFIRMED' },
    })
  })
}

export async function cancelCompetition(opts: {
  competitionId: string
  cancelledBy: string
  cancelReason?: string | null
  toStatus?: 'CANCELLED'
  refundEntries?: boolean
}) {
  const confirmedBefore = await prisma.competitionEntry.findMany({
    where: { competitionId: opts.competitionId, status: 'CONFIRMED' },
    select: { id: true },
  })

  const updated = await prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findUnique({ where: { id: opts.competitionId } })
    if (!competition) {
      throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
    }

    const toStatus = opts.toStatus ?? 'CANCELLED'
    try {
      assertCompetitionStatusTransition(competition.status, toStatus)
    } catch {
      throw createError({ statusCode: 409, statusMessage: 'Invalid competition status transition' })
    }

    const now = new Date()
    const reason = opts.cancelReason ?? 'Competition cancelled'

    const result = await tx.competition.update({
      where: { id: competition.id },
      data: {
        status: toStatus,
        cancelledAt: now,
        cancelledBy: opts.cancelledBy,
        cancelReason: reason,
      },
    })

    await tx.competitionEntry.updateMany({
      where: {
        competitionId: competition.id,
        status: 'PENDING',
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledBy: opts.cancelledBy,
        cancelReason: reason,
      },
    })

    // CONFIRMED entries are refunded outside the transaction (gateway calls).
    if (opts.refundEntries === false) {
      await tx.competitionEntry.updateMany({
        where: {
          competitionId: competition.id,
          status: 'CONFIRMED',
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: opts.cancelledBy,
          cancelReason: reason,
        },
      })
    }

    return result
  })

  if (opts.refundEntries !== false && confirmedBefore.length > 0) {
    await refundConfirmedEntries(
      opts.competitionId,
      opts.cancelledBy,
      opts.cancelReason ?? 'Competition cancelled',
    )
  }

  await notifyCompetitionCancelled(opts.competitionId, opts.cancelReason)

  return updated
}

export async function transitionCompetitionStatus(opts: {
  competitionId: string
  toStatus: Competition['status']
}) {
  return prisma.$transaction(async (tx) => {
    await lockCompetitionRow(tx, opts.competitionId)
    const competition = await tx.competition.findUnique({ where: { id: opts.competitionId } })
    if (!competition) {
      throw createError({ statusCode: 404, statusMessage: 'Competition not found' })
    }
    try {
      assertCompetitionStatusTransition(competition.status, opts.toStatus)
    } catch {
      throw createError({ statusCode: 409, statusMessage: 'Invalid competition status transition' })
    }
    return tx.competition.update({
      where: { id: competition.id },
      data: { status: opts.toStatus },
    })
  })
}

export { validatePrizeConfig, assertFreeEntryAllowed, assertCompetitionStatusTransition }
