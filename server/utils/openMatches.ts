import type { OpenMatch, OpenMatchPaymentMode, Prisma } from '@prisma/client'
import { createError } from 'h3'
import { initialPlatformPaymentFields, isOnlinePaymentsEnabled } from '#shared/bookingPayment.ts'
import { computeBookingPrice, computeListedSlotPrice } from '#shared/courtPricing.ts'
import { parseCourtAudience, courtAudienceBlockReason } from '#shared/courtAudience.ts'
import { parseGender } from '#shared/gender.ts'
import {
  assertOpenMatchJoinAllowed,
  computeShareForParticipant,
  defaultMaxPlayersForSportSlug,
  isOpenMatchEnabled,
  openMatchFillCutoffMinutes,
  openMatchJoinIdempotencyKey,
  splitSlotPriceToman,
} from '#shared/openMatch.ts'
import { userToGuestNamePair } from '#shared/userName.ts'
import { assertSlotBookable } from './reservations'
import { assertExternalBookingAllowedIfEnabled } from './externalBookingGuard'
import { deleteStaleCancelledBooking } from './staleBooking'
import { rethrowSlotConflict, SlotNotAvailableError } from './prismaErrors'
import { cancelCourtBooking } from './cancellations'
import { refundPaymentForCancellation } from './refunds'
import { readUserSkillForSport } from './skillRating'
import { applyPostMatchSkillUpdates } from './skillRating'
import { prisma } from './prisma'

type DbClient = Prisma.TransactionClient | typeof prisma

export { isOpenMatchEnabled }

function assertProductEnabled() {
  if (!isOpenMatchEnabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}

function computeFillCutoff(slotDate: string, startTime: string): Date {
  const minutes = openMatchFillCutoffMinutes()
  const start = new Date(`${slotDate}T${startTime}:00+03:30`)
  return new Date(start.getTime() - minutes * 60_000)
}

async function slotTotalForOpenMatch(slot: {
  price: number
  startTime: string
  date: string
  court: { price: number, pricingJson: string | null }
}) {
  const listed = computeListedSlotPrice(slot.court.price, slot.startTime, slot.court.pricingJson)
  return computeBookingPrice(listed, slot.court.pricingJson, slot.date, slot.startTime)
}

export async function createOpenMatch(opts: {
  hostUserId: string
  slotId: string
  paymentMode: OpenMatchPaymentMode
  matchType: 'FRIENDLY' | 'COMPETITIVE'
  maxPlayers?: number
  minPlayers?: number
  minLevel?: number | null
  maxLevel?: number | null
  note?: string | null
  /** Existing paid/held booking owned by host (HOST_PAYS from calendar). */
  bookingId?: string | null
}) {
  assertProductEnabled()
  requireOnlinePaymentsForHost(opts.paymentMode)

  const host = await prisma.user.findUniqueOrThrow({ where: { id: opts.hostUserId } })
  const hostGender = parseGender(host.gender)

  const slot = await prisma.slot.findFirst({
    where: { id: opts.slotId },
    include: {
      court: { include: { club: true, sport: true } },
      booking: true,
      openMatch: true,
    },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
  if (slot.openMatch) throw createError({ statusCode: 409, statusMessage: 'OPEN_MATCH_EXISTS' })

  const club = slot.court.club
  if (club.status !== 'ACTIVE') throw createError({ statusCode: 404, statusMessage: 'Club not found' })

  const audience = parseCourtAudience(slot.court.audience)
  const audienceBlock = courtAudienceBlockReason(audience, hostGender)
  if (audienceBlock) {
    throw createError({ statusCode: 403, statusMessage: audienceBlock.toUpperCase() })
  }

  assertSlotBookable(slot.date, slot.startTime, { horizonDays: club.bookingHorizonDays })

  await assertExternalBookingAllowedIfEnabled({
    club: {
      id: club.id,
      slug: club.slug,
      defaultSessionDurationMinutes: club.defaultSessionDurationMinutes,
      openHour: club.openHour,
      closeHour: club.closeHour,
    },
    slots: [{
      courtId: slot.courtId,
      date: slot.date,
      startTime: slot.startTime,
    }],
  })

  const maxPlayers = Math.max(
    2,
    Math.min(
      opts.maxPlayers || defaultMaxPlayersForSportSlug(slot.court.sport.slug),
      8,
    ),
  )
  const minPlayers = Math.max(2, Math.min(opts.minPlayers || 2, maxPlayers))

  const slotTotalPrice = await slotTotalForOpenMatch(slot)
  const fillCutoffAt = computeFillCutoff(slot.date, slot.startTime)

  try {
    return await prisma.$transaction(async (tx) => {
      let bookingId = opts.bookingId || ''
      if (opts.bookingId) {
        const booking = await tx.booking.findFirst({
          where: { id: opts.bookingId, userId: opts.hostUserId, slotId: slot.id },
          include: { payment: true, openMatch: true },
        })
        if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
        if (booking.openMatch) throw createError({ statusCode: 409, statusMessage: 'OPEN_MATCH_EXISTS' })
        if (opts.paymentMode !== 'HOST_PAYS') {
          throw createError({ statusCode: 400, statusMessage: 'BOOKING_LINK_HOST_PAYS_ONLY' })
        }
        bookingId = booking.id
      } else {
        const staleCancelledBooking = slot.displayStatus === 'FREE' && slot.booking?.status === 'CANCELLED'
          ? slot.booking
          : null
        if (slot.displayStatus !== 'FREE' || (slot.booking && !staleCancelledBooking)) {
          throw new SlotNotAvailableError()
        }

        const claimed = await tx.slot.updateMany({
          where: { id: slot.id, displayStatus: 'FREE' },
          data: { displayStatus: 'PUBLIC' },
        })
        if (claimed.count !== 1) throw new SlotNotAvailableError()
        if (staleCancelledBooking) await deleteStaleCancelledBooking(tx, staleCancelledBooking.id)

        const guest = userToGuestNamePair(host)
        const paymentFields = opts.paymentMode === 'HOST_PAYS'
          ? initialPlatformPaymentFields(slotTotalPrice)
          : initialPlatformPaymentFields(0)

        const booking = await tx.booking.create({
          data: {
            slotId: slot.id,
            userId: opts.hostUserId,
            guestName: guest.guestName,
            guestFamily: guest.guestFamily || undefined,
            guestMobile: host.phone,
            paymentStatus: opts.paymentMode === 'HOST_PAYS' ? paymentFields.paymentStatus : 'PENDING_ONLINE',
            status: 'CONFIRMED',
            source: 'PLATFORM',
            comments: opts.note || undefined,
          },
        })
        bookingId = booking.id

        if (opts.paymentMode === 'HOST_PAYS') {
          await tx.payment.create({
            data: {
              bookingId: booking.id,
              userId: opts.hostUserId,
              ...paymentFields.payment,
              metadataJson: JSON.stringify({ openMatchHost: true }),
            },
          })
        }
      }

      const openMatch = await tx.openMatch.create({
        data: {
          hostUserId: opts.hostUserId,
          clubId: club.id,
          courtId: slot.courtId,
          sportId: slot.court.sportId,
          slotId: slot.id,
          bookingId,
          paymentMode: opts.paymentMode,
          matchType: opts.matchType,
          maxPlayers,
          minPlayers,
          minLevel: opts.minLevel ?? undefined,
          maxLevel: opts.maxLevel ?? undefined,
          slotTotalPrice,
          note: opts.note || undefined,
          fillCutoffAt,
        },
      })

      const hostShare = opts.paymentMode === 'SPLIT_ONLINE'
        ? computeShareForParticipant(slotTotalPrice, maxPlayers, 0)
        : 0

      await tx.openMatchParticipant.create({
        data: {
          openMatchId: openMatch.id,
          userId: opts.hostUserId,
          isHost: true,
          shareAmount: hostShare,
        },
      })

      return { openMatch, bookingId, hostShare }
    })
  } catch (err) {
    rethrowSlotConflict(err)
    throw err
  }
}

function requireOnlinePaymentsForHost(mode: OpenMatchPaymentMode) {
  if (mode === 'SPLIT_ONLINE' && !isOnlinePaymentsEnabled()) {
    throw createError({ statusCode: 503, statusMessage: 'ONLINE_PAYMENTS_REQUIRED' })
  }
}

export async function listOpenMatches(filters: {
  sportId?: string
  clubId?: string
  city?: string
  paymentMode?: OpenMatchPaymentMode
  dateFrom?: string
  dateTo?: string
  viewerUserId?: string
}) {
  assertProductEnabled()
  const where: Prisma.OpenMatchWhereInput = {
    status: { in: ['OPEN', 'FULL', 'CONFIRMED'] },
    fillCutoffAt: { gt: new Date() },
  }
  if (filters.sportId) where.sportId = filters.sportId
  if (filters.clubId) where.clubId = filters.clubId
  if (filters.paymentMode) where.paymentMode = filters.paymentMode
  if (filters.city) where.club = { city: filters.city }
  if (filters.dateFrom || filters.dateTo) {
    where.slot = {
      date: {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo ? { lte: filters.dateTo } : {}),
      },
    }
  }

  const rows = await prisma.openMatch.findMany({
    where,
    include: {
      club: { select: { id: true, slug: true, nameFa: true, nameEn: true, city: true } },
      court: { select: { id: true, nameFa: true, nameEn: true, audience: true } },
      sport: { select: { id: true, slug: true, nameFa: true, nameEn: true, icon: true } },
      slot: { select: { date: true, startTime: true, endTime: true } },
      participants: {
        where: { status: 'JOINED' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              nameFamily: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
    orderBy: [{ slot: { date: 'asc' } }, { slot: { startTime: 'asc' } }],
    take: 100,
  })

  let viewerSkills = new Map<string, number | null>()
  if (filters.viewerUserId) {
    const skills = await prisma.userSportSkillRating.findMany({
      where: { userId: filters.viewerUserId },
      select: { sportId: true, rating: true },
    })
    viewerSkills = new Map(skills.map((s) => [s.sportId, s.rating]))
  }

  return rows
    .map((row) => {
      const joined = row.participants.length
      const shares = splitSlotPriceToman(row.slotTotalPrice, row.maxPlayers)
      const pricePerPlayer = shares[0] ?? 0
      const viewerRating = viewerSkills.get(row.sportId) ?? null
      return {
        ...row,
        openSpots: Math.max(0, row.maxPlayers - joined),
        pricePerPlayer,
        viewerSkillRating: viewerRating,
      }
    })
    .filter((row) => {
      if (filters.viewerUserId && row.minLevel != null) {
        const skill = row.viewerSkillRating
        if (skill != null && skill < row.minLevel - 0.01) return false
      }
      if (filters.viewerUserId && row.maxLevel != null) {
        const skill = row.viewerSkillRating
        if (skill != null && skill > row.maxLevel + 0.01) return false
      }
      return true
    })
}

export async function getOpenMatchDetail(id: string, viewerUserId?: string) {
  assertProductEnabled()
  const match = await prisma.openMatch.findUnique({
    where: { id },
    include: {
      club: true,
      court: true,
      sport: true,
      slot: true,
      booking: { include: { payment: true } },
      participants: {
        include: {
          user: { select: { id: true, name: true, nameFamily: true, avatarUrl: true, gender: true } },
          payment: { select: { id: true, status: true, amount: true } },
        },
      },
      results: true,
    },
  })
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const skillRows = await prisma.userSportSkillRating.findMany({
    where: {
      sportId: match.sportId,
      userId: { in: match.participants.map((p) => p.userId) },
    },
  })
  const skillByUser = new Map(skillRows.map((r) => [r.userId, r]))

  const viewerSkill = viewerUserId
    ? await readUserSkillForSport(viewerUserId, match.sportId)
    : null

  const shares = splitSlotPriceToman(match.slotTotalPrice, match.maxPlayers)
  return {
    match,
    participants: match.participants.map((p, idx) => ({
      ...p,
      skill: skillByUser.get(p.userId) || null,
      shareAmount: p.shareAmount || shares[idx] || shares[0],
    })),
    pricePerPlayer: shares[0] ?? 0,
    viewerSkill,
    openSpots: Math.max(0, match.maxPlayers - match.participants.filter((p) => p.status === 'JOINED').length),
  }
}

export async function joinOpenMatch(opts: {
  openMatchId: string
  userId: string
}) {
  assertProductEnabled()
  const user = await prisma.user.findUniqueOrThrow({ where: { id: opts.userId } })
  const match = await prisma.openMatch.findUnique({
    where: { id: opts.openMatchId },
    include: {
      court: true,
      slot: true,
      participants: { where: { status: 'JOINED' } },
    },
  })
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (new Date() > match.fillCutoffAt) {
    throw createError({ statusCode: 409, statusMessage: 'OPEN_MATCH_CUTOFF_PASSED' })
  }

  const existing = await prisma.openMatchParticipant.findUnique({
    where: { openMatchId_userId: { openMatchId: match.id, userId: opts.userId } },
    include: { payment: true },
  })
  if (existing?.status === 'JOINED') {
    return { participant: existing, payment: existing.payment, created: false as const }
  }

  const skill = await readUserSkillForSport(opts.userId, match.sportId)
  const block = assertOpenMatchJoinAllowed({
    userGender: user.gender,
    courtAudience: match.court.audience,
    userSkillRating: skill.rating,
    minLevel: match.minLevel,
    maxLevel: match.maxLevel,
    activeJoinedCount: match.participants.length,
    maxPlayers: match.maxPlayers,
    status: match.status,
  })
  if (block) throw createError({ statusCode: 403, statusMessage: block })

  const seatIndex = match.participants.length
  const shareAmount = match.paymentMode === 'SPLIT_ONLINE'
    ? computeShareForParticipant(match.slotTotalPrice, match.maxPlayers, seatIndex)
    : 0

  const participant = await prisma.$transaction(async (tx) => {
    const row = await tx.openMatchParticipant.upsert({
      where: { openMatchId_userId: { openMatchId: match.id, userId: opts.userId } },
      create: {
        openMatchId: match.id,
        userId: opts.userId,
        shareAmount,
        status: 'JOINED',
        leftAt: null,
      },
      update: {
        status: 'JOINED',
        shareAmount,
        leftAt: null,
      },
    })

    const joinedCount = await tx.openMatchParticipant.count({
      where: { openMatchId: match.id, status: 'JOINED' },
    })
    if (joinedCount >= match.maxPlayers) {
      await tx.openMatch.update({
        where: { id: match.id },
        data: { status: 'FULL' },
      })
    }
    return row
  })

  if (match.paymentMode === 'HOST_PAYS' || shareAmount <= 0) {
    await maybeConfirmOpenMatch(match.id)
    return { participant, payment: null, created: true as const }
  }

  if (!isOnlinePaymentsEnabled()) {
    throw createError({ statusCode: 503, statusMessage: 'ONLINE_PAYMENTS_REQUIRED' })
  }

  const platformFields = initialPlatformPaymentFields(shareAmount)
  const idempotencyKey = openMatchJoinIdempotencyKey(match.id, opts.userId, participant.id)

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        userId: opts.userId,
        purpose: 'open_match',
        idempotencyKey,
        ...platformFields.payment,
        metadataJson: JSON.stringify({
          openMatchId: match.id,
          openMatchParticipantId: participant.id,
          shareAmount,
          slotTotalPrice: match.slotTotalPrice,
        }),
      },
    })
    await tx.openMatchParticipant.update({
      where: { id: participant.id },
      data: { paymentId: p.id },
    })
    return p
  })

  return { participant, payment, created: true as const }
}

export async function leaveOpenMatch(opts: { openMatchId: string, userId: string }) {
  assertProductEnabled()
  const match = await prisma.openMatch.findUnique({
    where: { id: opts.openMatchId },
    include: {
      participants: true,
      booking: { include: { payment: true } },
    },
  })
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (match.hostUserId === opts.userId) {
    return cancelOpenMatch({ openMatchId: match.id, actorUserId: opts.userId, reason: 'host_left' })
  }

  const participant = match.participants.find((p) => p.userId === opts.userId && p.status === 'JOINED')
  if (!participant) throw createError({ statusCode: 404, statusMessage: 'Not joined' })

  let refund = null
  if (participant.paymentId) {
    refund = await refundPaymentForCancellation({
      paymentId: participant.paymentId,
      userId: opts.userId,
      reason: 'open_match_leave',
      moneyOutcome: 'full_wallet_refund',
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.openMatchParticipant.update({
      where: { id: participant.id },
      data: { status: 'LEFT', leftAt: new Date() },
    })
    const joined = await tx.openMatchParticipant.count({
      where: { openMatchId: match.id, status: 'JOINED' },
    })
    if (match.status === 'FULL' && joined < match.maxPlayers) {
      await tx.openMatch.update({ where: { id: match.id }, data: { status: 'OPEN' } })
    }
  })

  return { left: true, refund }
}

export async function cancelOpenMatch(opts: {
  openMatchId: string
  actorUserId?: string
  reason: string
}) {
  assertProductEnabled()
  const match = await prisma.openMatch.findUnique({
    where: { id: opts.openMatchId },
    include: {
      participants: { where: { status: 'JOINED' }, include: { payment: true } },
      booking: { include: { payment: true } },
      slot: true,
    },
  })
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (match.status === 'CANCELLED' || match.status === 'EXPIRED') {
    return { already: true as const }
  }

  const refunds: unknown[] = []
  for (const p of match.participants) {
    if (p.paymentId && p.payment?.status === 'PAID') {
      const r = await refundPaymentForCancellation({
        paymentId: p.paymentId,
        userId: p.userId,
        reason: opts.reason,
        moneyOutcome: 'full_wallet_refund',
      })
      refunds.push(r)
      await prisma.openMatchParticipant.update({
        where: { id: p.id },
        data: { status: 'REFUNDED' },
      })
    }
  }

  await cancelCourtBooking({
    bookingId: match.bookingId,
    slotId: match.slotId,
    actorUserId: opts.actorUserId,
    reason: opts.reason,
    paymentId: match.booking.payment?.id,
    userId: match.booking.userId,
    moneyOutcome: match.booking.payment?.status === 'PAID' ? 'full_wallet_refund' : 'zero_refund',
    skipLinkedCoachSession: true,
  })

  await prisma.openMatch.update({
    where: { id: match.id },
    data: {
      status: opts.reason === 'open_match_expired' ? 'EXPIRED' : 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: opts.reason,
    },
  })

  return { cancelled: true, refunds }
}

export async function maybeConfirmOpenMatch(openMatchId: string, db: DbClient = prisma) {
  const match = await db.openMatch.findUnique({
    where: { id: openMatchId },
    include: {
      participants: { where: { status: 'JOINED' }, include: { payment: true } },
      booking: { include: { payment: true } },
    },
  })
  if (!match) return null
  if (match.status === 'CONFIRMED' || match.status === 'COMPLETED') return match

  const joined = match.participants.length
  if (joined < match.minPlayers) return null

  if (match.paymentMode === 'HOST_PAYS') {
    const hostPaid = match.booking.payment?.status === 'PAID'
      || match.booking.paymentStatus === 'PAID'
    if (!hostPaid && match.booking.payment?.status !== 'PAY_AT_CLUB') return null
    await db.openMatch.update({
      where: { id: match.id },
      data: { status: 'CONFIRMED' },
    })
    return db.openMatch.findUnique({ where: { id: match.id } })
  }

  const unpaid = match.participants.some((p) => {
    if (p.shareAmount <= 0) return false
    if (!p.paymentId) return true
    return p.payment?.status !== 'PAID'
  })
  if (unpaid) return null

  const paidSum = match.participants.reduce((sum, p) => sum + (p.payment?.status === 'PAID' ? p.payment.amount : 0), 0)
  if (paidSum !== match.slotTotalPrice) {
    console.warn('[openMatch] share sum mismatch', openMatchId, paidSum, match.slotTotalPrice)
  }

  await db.booking.update({
    where: { id: match.bookingId },
    data: { paymentStatus: 'PAID' },
  })
  await db.openMatch.update({
    where: { id: match.id },
    data: { status: 'CONFIRMED' },
  })
  return db.openMatch.findUnique({ where: { id: match.id } })
}

export async function syncOpenMatchHostBookingOnPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { booking: { include: { openMatch: true } } },
  })
  const openMatchId = payment?.booking?.openMatch?.id
  if (!openMatchId) return { handled: false as const }
  await maybeConfirmOpenMatch(openMatchId)
  return { handled: true as const }
}

export async function confirmOpenMatchShareFromPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      openMatchParticipant: { include: { openMatch: true } },
    },
  })
  if (!payment || payment.purpose !== 'open_match') return { handled: false as const }
  if (payment.status !== 'PAID') return { handled: false as const }

  const openMatchId = payment.openMatchParticipant?.openMatchId
    || (() => {
      try {
        const meta = JSON.parse(payment.metadataJson || '{}') as { openMatchId?: string }
        return meta.openMatchId
      } catch {
        return undefined
      }
    })()
  if (!openMatchId) return { handled: true as const }
  await maybeConfirmOpenMatch(openMatchId)
  return { handled: true as const }
}

export async function expireUnfilledOpenMatches(now = new Date()) {
  assertProductEnabled()
  const candidates = await prisma.openMatch.findMany({
    where: {
      paymentMode: 'SPLIT_ONLINE',
      status: { in: ['OPEN', 'FULL'] },
      fillCutoffAt: { lte: now },
    },
    select: { id: true },
    take: 50,
  })

  const results: string[] = []
  for (const row of candidates) {
    const match = await prisma.openMatch.findUnique({
      where: { id: row.id },
      include: { participants: { where: { status: 'JOINED' } } },
    })
    if (!match) continue
    if (match.participants.length >= match.minPlayers) {
      await maybeConfirmOpenMatch(match.id)
      continue
    }
    await cancelOpenMatch({ openMatchId: match.id, reason: 'open_match_expired' })
    results.push(match.id)
  }
  return { expired: results.length, ids: results }
}

export async function submitOpenMatchResult(opts: {
  openMatchId: string
  userId: string
  score: Record<string, unknown>
  opponentUserId?: string
}) {
  assertProductEnabled()
  const match = await prisma.openMatch.findUnique({
    where: { id: opts.openMatchId },
    include: { participants: { where: { status: 'JOINED' } } },
  })
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (match.status !== 'CONFIRMED' && match.status !== 'COMPLETED') {
    throw createError({ statusCode: 409, statusMessage: 'OPEN_MATCH_NOT_READY' })
  }

  const isParticipant = match.participants.some((p) => p.userId === opts.userId)
  if (!isParticipant) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const result = await prisma.openMatchResult.create({
    data: {
      openMatchId: match.id,
      submittedById: opts.userId,
      scoreJson: JSON.stringify(opts.score),
      opponentUserId: opts.opponentUserId,
    },
  })

  if (opts.opponentUserId) {
    const confirmRow = await prisma.openMatchResult.findFirst({
      where: {
        openMatchId: match.id,
        submittedById: opts.opponentUserId,
        opponentConfirmedAt: null,
      },
    })
    if (confirmRow) {
      await prisma.openMatchResult.update({
        where: { id: confirmRow.id },
        data: { opponentConfirmedAt: new Date(), opponentUserId: opts.userId },
      })
    }
  }

  const confirmed = await prisma.openMatchResult.count({
    where: { openMatchId: match.id, opponentConfirmedAt: { not: null } },
  })
  if (confirmed >= 1) {
    await prisma.openMatch.update({
      where: { id: match.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
  }

  return result
}

export async function submitOpenMatchPeerRatings(opts: {
  openMatchId: string
  fromUserId: string
  ratings: Array<{ toUserId: string, perceivedLevel: number, fairPlayScore: number, note?: string }>
}) {
  assertProductEnabled()
  const match = await prisma.openMatch.findUnique({
    where: { id: opts.openMatchId },
    include: { participants: { where: { status: 'JOINED' } } },
  })
  if (!match) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (match.status !== 'COMPLETED') {
    throw createError({ statusCode: 409, statusMessage: 'OPEN_MATCH_NOT_COMPLETED' })
  }

  const joinedIds = new Set(match.participants.map((p) => p.userId))
  if (!joinedIds.has(opts.fromUserId)) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  await prisma.$transaction(async (tx) => {
    for (const row of opts.ratings) {
      if (!joinedIds.has(row.toUserId) || row.toUserId === opts.fromUserId) continue
      await tx.openMatchPeerRating.upsert({
        where: {
          openMatchId_fromUserId_toUserId: {
            openMatchId: match.id,
            fromUserId: opts.fromUserId,
            toUserId: row.toUserId,
          },
        },
        create: {
          openMatchId: match.id,
          fromUserId: opts.fromUserId,
          toUserId: row.toUserId,
          perceivedLevel: row.perceivedLevel,
          fairPlayScore: row.fairPlayScore,
          note: row.note,
        },
        update: {
          perceivedLevel: row.perceivedLevel,
          fairPlayScore: row.fairPlayScore,
          note: row.note,
        },
      })
    }
  })

  const skills = await prisma.userSportSkillRating.findMany({
    where: { sportId: match.sportId, userId: { in: [...joinedIds] } },
  })
  const skillMap = new Map(skills.map((s) => [s.userId, s.rating]))
  const peerRows = await prisma.openMatchPeerRating.findMany({ where: { openMatchId: match.id } })
  const byTarget = new Map<string, { levels: number[], fair: number[] }>()
  for (const pr of peerRows) {
    const bucket = byTarget.get(pr.toUserId) || { levels: [], fair: [] }
    bucket.levels.push(pr.perceivedLevel)
    bucket.fair.push(pr.fairPlayScore)
    byTarget.set(pr.toUserId, bucket)
  }

  const outcomes = [...joinedIds].map((userId) => {
    const peers = byTarget.get(userId)
    const opponents = [...joinedIds].filter((id) => id !== userId)
    const opponentRating = opponents.length
      ? opponents.reduce((s, id) => s + (skillMap.get(id) ?? 3), 0) / opponents.length
      : 3
    return {
      userId,
      outcome: 0.5,
      opponentRating,
      peerPerceivedLevel: peers?.levels.length
        ? peers.levels.reduce((a, b) => a + b, 0) / peers.levels.length
        : null,
      fairPlayScore: peers?.fair.length
        ? Math.round(peers.fair.reduce((a, b) => a + b, 0) / peers.fair.length)
        : null,
    }
  })

  await applyPostMatchSkillUpdates({
    openMatchId: match.id,
    sportId: match.sportId,
    matchType: match.matchType,
    userOutcomes: outcomes,
  })

  return { saved: opts.ratings.length }
}