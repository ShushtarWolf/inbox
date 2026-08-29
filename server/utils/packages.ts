import type { Prisma, PrismaClient } from '@prisma/client'
import {
  ACTIVE_PACKAGE_BOOKING_STATUSES,
  PENDING_PACKAGE_BOOKING_EXPIRY_MINUTES,
  canCancelPackageBooking,
  type PackageConflict,
  type PackageSession,
} from '#shared/packages.ts'
import {
  expandDayTimeRanges,
  parseSeasonTimesJson,
  weekdayNameFromDate,
  type DayTimeRange,
} from '#shared/recurringSessions.ts'
import { canClaimExistingSlotForRecurring } from '#shared/recurringReserve.ts'
import { initialPlatformPaymentFields } from '#shared/bookingPayment.ts'
import { datesForWeekdaysInRange } from './seasonSlots'
import { formatHour, hourEnd, addMinutes, ensureSlotsForDate } from './slots'
import { hourFromTime } from './seasonSlots'
import { isSlotStartInPast } from '#shared/localDate.ts'
import { refundPaymentForCancellation } from './refunds'
import { prisma } from './prisma'

type DbClient = PrismaClient | Prisma.TransactionClient

export type PackageScheduleInput = {
  startDate: string
  finishDate: string
  days: string[]
  dayTimes?: Record<string, DayTimeRange>
  times?: string[]
  timesJson?: string | null
  daysJson?: string | null
}

function resolveExpandedDayTimes(input: PackageScheduleInput): Record<string, string[]> {
  if (input.dayTimes && Object.keys(input.dayTimes).length) {
    return expandDayTimeRanges(input.dayTimes)
  }
  if (input.timesJson) {
    const parsed = parseSeasonTimesJson(input.timesJson)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const asRanges = parsed as Record<string, DayTimeRange>
      const first = Object.values(asRanges)[0]
      if (first && typeof first === 'object' && 'start' in first) {
        return expandDayTimeRanges(asRanges)
      }
    }
    try {
      const arr = JSON.parse(input.timesJson) as string[]
      if (Array.isArray(arr) && arr.length && input.days.length) {
        return Object.fromEntries(input.days.map((d) => [d, arr]))
      }
    } catch {
      // ignore
    }
  }
  if (input.times?.length && input.days.length) {
    return Object.fromEntries(input.days.map((d) => [d, input.times!]))
  }
  return {}
}

export function expandPackageSessions(
  input: PackageScheduleInput,
  sessionDurationMinutes = 60,
): PackageSession[] {
  const days = input.days.length
    ? input.days
    : (input.daysJson ? (JSON.parse(input.daysJson) as string[]) : [])
  const expanded = resolveExpandedDayTimes({ ...input, days })
  const dates = datesForWeekdaysInRange(input.startDate, input.finishDate, days)
  const sessions: PackageSession[] = []
  for (const date of dates) {
    const weekday = weekdayNameFromDate(date)
    const times = expanded[weekday] || []
    for (const startTime of times) {
      if (isSlotStartInPast(date, startTime)) continue
      const hour = hourFromTime(startTime)
      const endTime = sessionDurationMinutes === 60
        ? hourEnd(hour)
        : addMinutes(startTime, sessionDurationMinutes)
      sessions.push({ date, startTime: formatHour(hour) === startTime ? startTime : startTime, endTime })
    }
  }
  return sessions
}

export async function lockPackageRow(tx: Prisma.TransactionClient, packageId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "PackageDraft" WHERE id = ${packageId} FOR UPDATE
  `
  if (rows.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Package not found' })
  }
}

export async function countActivePackageSeats(
  packageId: string,
  client: DbClient = prisma,
): Promise<number> {
  const [bookings, players] = await Promise.all([
    client.packageBooking.count({
      where: {
        packageId,
        status: { in: [...ACTIVE_PACKAGE_BOOKING_STATUSES] },
      },
    }),
    client.packagePlayer.count({ where: { packageId } }),
  ])
  return bookings + players
}

export async function findPackageConflicts(opts: {
  clubId: string
  courtId: string
  coachId?: string | null
  sessions: PackageSession[]
  excludePackageId?: string
}): Promise<PackageConflict[]> {
  const conflicts: PackageConflict[] = []
  if (!opts.sessions.length) return conflicts

  const dates = [...new Set(opts.sessions.map((s) => s.date))]
  for (const date of dates) {
    await ensureSlotsForDate(opts.clubId, date)
  }

  const slots = await prisma.slot.findMany({
    where: {
      courtId: opts.courtId,
      date: { in: dates },
      displayStatus: { not: 'CANCELLED' },
    },
    include: { booking: true },
  })
  const slotByKey = new Map(slots.map((s) => [`${s.date}|${s.startTime}`, s]))

  for (const session of opts.sessions) {
    const existing = slotByKey.get(`${session.date}|${session.startTime}`) || null
    const bookingRow = existing?.booking as
      | { status: string; packageDraftId?: string | null }
      | null
      | undefined
    const claimable = canClaimExistingSlotForRecurring(
      existing
        ? {
            displayStatus: existing.displayStatus,
            booking: bookingRow
              ? { status: bookingRow.status }
              : null,
          }
        : null,
    )
    if (!claimable) {
      const ownHold = bookingRow?.packageDraftId
        && opts.excludePackageId
        && bookingRow.packageDraftId === opts.excludePackageId
        && bookingRow.status !== 'CANCELLED'
      if (!ownHold) {
        conflicts.push({
          kind: 'court_slot',
          date: session.date,
          startTime: session.startTime,
          slotId: existing?.id,
          label: existing?.displayStatus || 'TAKEN',
        })
      }
    }
  }

  const otherOpen = await prisma.packageDraft.findMany({
    where: {
      clubId: opts.clubId,
      status: 'OPEN',
      ...(opts.excludePackageId ? { id: { not: opts.excludePackageId } } : {}),
      OR: [
        { courtId: opts.courtId },
        ...(opts.coachId ? [{ coachId: opts.coachId }] : []),
      ],
    },
  })

  const sessionKeys = new Set(opts.sessions.map((s) => `${s.date}|${s.startTime}`))
  for (const pkg of otherOpen) {
    if (!pkg.startDate || !pkg.finishDate) continue
    const days = pkg.daysJson ? (JSON.parse(pkg.daysJson) as string[]) : []
    const otherSessions = expandPackageSessions({
      startDate: pkg.startDate,
      finishDate: pkg.finishDate,
      days,
      timesJson: pkg.timesJson,
      daysJson: pkg.daysJson,
    })
    for (const s of otherSessions) {
      const key = `${s.date}|${s.startTime}`
      if (!sessionKeys.has(key)) continue
      if (pkg.courtId === opts.courtId) {
        conflicts.push({
          kind: 'package_court',
          date: s.date,
          startTime: s.startTime,
          packageId: pkg.id,
          label: pkg.title,
        })
      }
      if (opts.coachId && pkg.coachId === opts.coachId) {
        conflicts.push({
          kind: 'package_coach',
          date: s.date,
          startTime: s.startTime,
          packageId: pkg.id,
          label: pkg.title,
        })
      }
    }
  }

  if (opts.coachId) {
    const coachSessions = await prisma.coachSession.findMany({
      where: {
        coachId: opts.coachId,
        status: { not: 'CANCELLED' },
        date: { in: dates },
      },
    })
    for (const cs of coachSessions) {
      if (sessionKeys.has(`${cs.date}|${cs.startTime}`)) {
        conflicts.push({
          kind: 'coach_session',
          date: cs.date,
          startTime: cs.startTime,
          coachSessionId: cs.id,
        })
      }
    }
  }

  return conflicts
}

export async function claimPackageCourtHolds(opts: {
  tx: Prisma.TransactionClient
  packageId: string
  clubId: string
  courtId: string
  coachId?: string | null
  title: string
  sessions: PackageSession[]
}) {
  const court = await opts.tx.court.findFirst({
    where: { id: opts.courtId, clubId: opts.clubId },
    include: { club: true },
  })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Court not found' })

  for (const session of opts.sessions) {
    await ensureSlotsForDate(opts.clubId, session.date)
    const existing = await opts.tx.slot.findFirst({
      where: {
        courtId: opts.courtId,
        date: session.date,
        startTime: session.startTime,
        displayStatus: { not: 'CANCELLED' },
      },
      include: { booking: true },
    })

    const bookingRow = existing?.booking as
      | { id: string; status: string; packageDraftId?: string | null }
      | null
      | undefined
    const ownHold = bookingRow?.packageDraftId === opts.packageId
      && bookingRow.status !== 'CANCELLED'
    if (!ownHold && !canClaimExistingSlotForRecurring(
      existing
        ? { displayStatus: existing.displayStatus, booking: bookingRow ? { status: bookingRow.status } : null }
        : null,
    )) {
      throw createError({
        statusCode: 409,
        statusMessage: 'PACKAGE_CONFLICT',
        data: {
          conflicts: [{
            kind: 'court_slot',
            date: session.date,
            startTime: session.startTime,
            slotId: existing?.id,
          }],
        },
      })
    }

    let slotId: string
    if (existing) {
      await opts.tx.slot.update({
        where: { id: existing.id },
        data: { displayStatus: 'TEAM' },
      })
      slotId = existing.id
      if (ownHold) continue
      if (bookingRow?.status === 'CANCELLED') {
        await opts.tx.booking.delete({ where: { id: bookingRow.id } })
      }
    } else {
      const slot = await opts.tx.slot.create({
        data: {
          courtId: opts.courtId,
          date: session.date,
          startTime: session.startTime,
          endTime: session.endTime,
          price: court.price,
          displayStatus: 'TEAM',
        },
      })
      slotId = slot.id
    }

    const booking = await opts.tx.booking.create({
      data: {
        slotId,
        guestName: opts.title,
        comments: `package:${opts.packageId}`,
        coachId: opts.coachId || null,
        packageDraftId: opts.packageId,
        paymentMethod: 'CASH',
        paymentStatus: 'PAY_AT_CLUB',
        status: 'CONFIRMED',
        source: 'CLUB',
      },
    })
    await opts.tx.reservationEvent.create({
      data: {
        bookingId: booking.id,
        type: 'CREATED',
        metadataJson: JSON.stringify({ source: 'class-package', packageId: opts.packageId }),
      },
    })
  }
}

export async function releasePackageCourtHolds(
  packageId: string,
  client: DbClient = prisma,
) {
  const holds = await client.booking.findMany({
    where: {
      packageDraftId: packageId,
      status: { not: 'CANCELLED' },
    },
    select: { id: true, slotId: true },
  })
  for (const hold of holds) {
    await client.booking.update({
      where: { id: hold.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'package-cancelled' },
    })
    await client.slot.update({
      where: { id: hold.slotId },
      data: { displayStatus: 'FREE' },
    })
  }
  return holds.length
}

export async function publishPackageDraft(opts: {
  packageId: string
  clubId: string
  actorUserId: string
}) {
  return prisma.$transaction(async (tx) => {
    await lockPackageRow(tx, opts.packageId)
    const pkg = await tx.packageDraft.findFirst({
      where: { id: opts.packageId, clubId: opts.clubId },
      include: { club: true, court: true },
    })
    if (!pkg) throw createError({ statusCode: 404, statusMessage: 'Package not found' })
    if (pkg.status === 'CANCELLED') {
      throw createError({ statusCode: 409, statusMessage: 'PACKAGE_CANCELLED' })
    }
    if (!pkg.courtId || !pkg.startDate || !pkg.finishDate) {
      throw createError({ statusCode: 400, statusMessage: 'PACKAGE_SCHEDULE_INCOMPLETE' })
    }
    const days = pkg.daysJson ? (JSON.parse(pkg.daysJson) as string[]) : []
    if (!days.length) {
      throw createError({ statusCode: 400, statusMessage: 'PACKAGE_SCHEDULE_INCOMPLETE' })
    }

    const duration = pkg.club.defaultSessionDurationMinutes || 60
    const sessions = expandPackageSessions({
      startDate: pkg.startDate,
      finishDate: pkg.finishDate,
      days,
      timesJson: pkg.timesJson,
      daysJson: pkg.daysJson,
    }, duration)

    if (!sessions.length) {
      throw createError({ statusCode: 400, statusMessage: 'PACKAGE_NO_SESSIONS' })
    }

    const conflicts = await findPackageConflicts({
      clubId: opts.clubId,
      courtId: pkg.courtId,
      coachId: pkg.coachId,
      sessions,
      excludePackageId: pkg.id,
    })
    if (conflicts.length) {
      throw createError({
        statusCode: 409,
        statusMessage: 'PACKAGE_CONFLICT',
        data: { conflicts },
      })
    }

    // Release prior holds if re-publishing
    await releasePackageCourtHolds(pkg.id, tx)

    await claimPackageCourtHolds({
      tx,
      packageId: pkg.id,
      clubId: opts.clubId,
      courtId: pkg.courtId,
      coachId: pkg.coachId,
      title: pkg.title,
      sessions,
    })

    return tx.packageDraft.update({
      where: { id: pkg.id },
      data: {
        status: 'OPEN',
        publishedAt: new Date(),
      },
      include: {
        coach: true,
        court: true,
        _count: { select: { bookings: true, players: true } },
      },
    })
  })
}

export async function cancelPackageDraft(opts: {
  packageId: string
  clubId: string
}) {
  return prisma.$transaction(async (tx) => {
    await lockPackageRow(tx, opts.packageId)
    const pkg = await tx.packageDraft.findFirst({
      where: { id: opts.packageId, clubId: opts.clubId },
    })
    if (!pkg) throw createError({ statusCode: 404, statusMessage: 'Package not found' })
    await releasePackageCourtHolds(pkg.id, tx)
    return tx.packageDraft.update({
      where: { id: pkg.id },
      data: { status: 'CANCELLED' },
    })
  })
}

export async function bookPackageSeat(opts: {
  packageId: string
  athleteId: string
  days?: string[]
  times?: string[]
}) {
  return prisma.$transaction(async (tx) => {
    await lockPackageRow(tx, opts.packageId)
    const pkg = await tx.packageDraft.findUnique({
      where: { id: opts.packageId },
      include: { club: true },
    })
    if (!pkg || pkg.club.status !== 'ACTIVE' || pkg.status !== 'OPEN') {
      throw createError({ statusCode: 404, statusMessage: 'Package not found' })
    }

    const existing = await tx.packageBooking.findFirst({
      where: {
        packageId: pkg.id,
        athleteId: opts.athleteId,
        status: { in: [...ACTIVE_PACKAGE_BOOKING_STATUSES] },
      },
    })
    if (existing) {
      throw createError({ statusCode: 409, statusMessage: 'PACKAGE_ALREADY_BOOKED' })
    }

    const seats = await countActivePackageSeats(pkg.id, tx)
    if (seats >= pkg.capacity) {
      throw createError({ statusCode: 409, statusMessage: 'Package is full' })
    }

    const price = Math.max(0, pkg.price - (pkg.discount || 0))
    const paymentFields = initialPlatformPaymentFields(price)
    const booking = await tx.packageBooking.create({
      data: {
        packageId: pkg.id,
        athleteId: opts.athleteId,
        price,
        status: 'PENDING',
        paymentStatus: paymentFields.paymentStatus,
        daysJson: opts.days?.length ? JSON.stringify(opts.days) : pkg.daysJson,
        timesJson: opts.times?.length ? JSON.stringify(opts.times) : null,
      },
    })
    await tx.payment.create({
      data: {
        packageBookingId: booking.id,
        ...paymentFields.payment,
      },
    })
    return booking
  })
}

export async function confirmPackageBookingFromPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { packageBooking: true },
  })
  if (!payment?.packageBookingId || !payment.packageBooking) return
  if (payment.status !== 'PAID') return
  if (payment.packageBooking.status === 'CONFIRMED') return
  if (payment.packageBooking.status === 'CANCELLED') return
  await prisma.packageBooking.update({
    where: { id: payment.packageBookingId },
    data: { status: 'CONFIRMED', paymentStatus: 'PAID' },
  })
}

export function assertPackageCancelAllowed(pkg: {
  startDate?: string | null
  timesJson?: string | null
  daysJson?: string | null
  club: { cancellationWindowHours: number }
}) {
  if (!pkg.startDate) return
  let firstTime = '00:00'
  if (pkg.timesJson) {
    const expanded = resolveExpandedDayTimes({
      startDate: pkg.startDate,
      finishDate: pkg.startDate,
      days: pkg.daysJson ? (JSON.parse(pkg.daysJson) as string[]) : [],
      timesJson: pkg.timesJson,
    })
    const first = Object.values(expanded).find((t) => t.length)?.[0]
    if (first) firstTime = first
  }
  if (!canCancelPackageBooking(pkg.startDate, firstTime, pkg.club.cancellationWindowHours)) {
    throw createError({ statusCode: 409, statusMessage: 'Cancellation window has passed' })
  }
}

export async function expireStalePendingPackageBookings(now = new Date()) {
  const cutoff = new Date(now.getTime() - PENDING_PACKAGE_BOOKING_EXPIRY_MINUTES * 60 * 1000)
  const stale = await prisma.packageBooking.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
      paymentStatus: { in: ['PENDING_ONLINE', 'FAILED'] },
    },
    include: { payment: true },
  })

  // Pay-at-club seats stay until desk collects or package starts — only online holds expire.
  let expired = 0
  for (const booking of stale) {
    await prisma.packageBooking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt: now },
    })
    expired += 1
  }
  return { expired, scanned: stale.length }
}

export { canCancelPackageBooking, refundPaymentForCancellation }
