import { classifyBlockCandidate, type BlockConflictRef, type BlockSlotRef } from '#shared/blockWeekly.ts'
import { isSlotStartInPast } from '#shared/localDate.ts'
import { clampWeeklyWeeks, weeklyOccurrenceDates } from '#shared/weeklyOccurrences.ts'
import { SlotNotAvailableError } from './prismaErrors'
import { prisma } from './prisma'
import { activeSlotBooking } from './reservations'
import { hourFromTime } from './seasonSlots'
import { ensureSlotsForDate, formatHour } from './slots'

export type WeeklyBlockPreviewResult = {
  willBlock: BlockSlotRef[]
  willBlockCount: number
  conflicts: BlockConflictRef[]
  skippedCount: number
  weeks: number
  courtId: string
  startTime: string
  anchorDate: string
}

type GuestBlockData = {
  guestName: string | null
  guestFamily: string | null
  guestMobile: string | null
  comments: string | null
}

async function loadCourt(clubId: string, courtId: string) {
  return prisma.court.findFirst({
    where: { id: courtId, clubId },
    include: { club: true },
  })
}

/** Dry-run: classify each weekly occurrence as blockable or conflict. */
export async function previewWeeklyBlock(opts: {
  clubId: string
  courtId: string
  startTime: string
  anchorDate: string
  weeks: number
}): Promise<WeeklyBlockPreviewResult> {
  const weeks = clampWeeklyWeeks(opts.weeks)
  const startTime = formatHour(hourFromTime(opts.startTime))
  const dates = weeklyOccurrenceDates(opts.anchorDate, weeks)
  const court = await loadCourt(opts.clubId, opts.courtId)
  const willBlock: BlockSlotRef[] = []
  const conflicts: BlockConflictRef[] = []

  if (!court) {
    for (const date of dates) {
      conflicts.push({ date, startTime, courtId: opts.courtId, reason: 'MISSING' })
    }
    return {
      willBlock,
      willBlockCount: 0,
      conflicts,
      skippedCount: conflicts.length,
      weeks,
      courtId: opts.courtId,
      startTime,
      anchorDate: opts.anchorDate,
    }
  }

  const openHour = court.openHour ?? court.club.openHour
  const closeHour = court.closeHour ?? court.club.closeHour
  const hour = hourFromTime(startTime)

  for (const date of dates) {
    if (hour < openHour || hour >= closeHour) {
      conflicts.push({ date, startTime, courtId: court.id, reason: 'OUTSIDE_HOURS' })
      continue
    }
    if (isSlotStartInPast(date, startTime)) {
      conflicts.push({ date, startTime, courtId: court.id, reason: 'PAST' })
      continue
    }

    await ensureSlotsForDate(opts.clubId, date)
    const existing = await prisma.slot.findFirst({
      where: { courtId: court.id, date, startTime, displayStatus: { not: 'CANCELLED' } },
      include: { booking: true },
    })
    if (!existing) {
      conflicts.push({ date, startTime, courtId: court.id, reason: 'MISSING' })
      continue
    }

    const verdict = classifyBlockCandidate({
      displayStatus: existing.displayStatus,
      bookingSource: existing.booking?.source,
      bookingStatus: existing.booking?.status,
    })
    if (verdict !== 'BLOCKABLE') {
      conflicts.push({ date, startTime, courtId: court.id, slotId: existing.id, reason: 'OCCUPIED' })
      continue
    }

    willBlock.push({ date, startTime, courtId: court.id, slotId: existing.id })
  }

  return {
    willBlock,
    willBlockCount: willBlock.length,
    conflicts,
    skippedCount: conflicts.length,
    weeks,
    courtId: court.id,
    startTime,
    anchorDate: opts.anchorDate,
  }
}

async function blockOneSlot(slotId: string, clubId: string, guestData: GuestBlockData) {
  const slot = await prisma.slot.findFirst({
    where: { id: slotId, court: { clubId } },
    include: { booking: true },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Slot not found' })

  if (classifyBlockCandidate({
    displayStatus: slot.displayStatus,
    bookingSource: slot.booking?.source,
    bookingStatus: slot.booking?.status,
  }) !== 'BLOCKABLE') {
    throw createError({ statusCode: 409, statusMessage: 'SLOT_NOT_BLOCKABLE' })
  }

  const existing = activeSlotBooking(slot.booking)
  const staleCancelled = slot.booking?.status === 'CANCELLED' ? slot.booking : null

  if (existing) {
    if (existing.source !== 'CLUB') {
      throw createError({ statusCode: 409, statusMessage: 'SLOT_NOT_BLOCKABLE' })
    }
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: existing.id },
        data: guestData,
      })
      await tx.slot.update({
        where: { id: slot.id },
        data: { displayStatus: 'BLOCKED' },
      })
    })
    return
  }

  await prisma.$transaction(async (tx) => {
    if (staleCancelled) {
      await tx.booking.delete({ where: { id: staleCancelled.id } })
    }
    const claimed = await tx.slot.updateMany({
      where: { id: slot.id, displayStatus: 'FREE' },
      data: { displayStatus: 'BLOCKED' },
    })
    if (claimed.count !== 1) {
      throw new SlotNotAvailableError()
    }
    await tx.booking.create({
      data: {
        slotId: slot.id,
        ...guestData,
        source: 'CLUB',
        status: 'CONFIRMED',
        paymentStatus: 'PAY_AT_CLUB',
      },
    })
  })
}

/** Block explicit slot ids (single-day / multi-select path). */
export async function applyBlockSlotIds(opts: {
  clubId: string
  slotIds: string[]
  guestData: GuestBlockData
}) {
  for (const slotId of opts.slotIds) {
    await blockOneSlot(slotId, opts.clubId, opts.guestData)
  }
  return { ok: true as const, count: opts.slotIds.length }
}

/**
 * Weekly block from an anchor slot: preview → block willBlock ids.
 * Soft-skips conflicts when acceptSkips; otherwise 409 with preview payload.
 */
export async function applyWeeklyBlock(opts: {
  clubId: string
  courtId: string
  startTime: string
  anchorDate: string
  weeks: number
  acceptSkips: boolean
  guestData: GuestBlockData
}) {
  const preview = await previewWeeklyBlock({
    clubId: opts.clubId,
    courtId: opts.courtId,
    startTime: opts.startTime,
    anchorDate: opts.anchorDate,
    weeks: opts.weeks,
  })

  if (preview.willBlockCount === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'NO_BLOCKABLE_SLOTS',
      data: {
        willBlockCount: 0,
        skippedCount: preview.skippedCount,
        willBlock: preview.willBlock,
        conflicts: preview.conflicts,
      },
    })
  }

  if (preview.skippedCount > 0 && !opts.acceptSkips) {
    throw createError({
      statusCode: 409,
      statusMessage: 'BLOCK_CONFLICTS_NEED_CONFIRM',
      data: {
        willBlockCount: preview.willBlockCount,
        skippedCount: preview.skippedCount,
        willBlock: preview.willBlock,
        conflicts: preview.conflicts,
      },
    })
  }

  let blocked = 0
  const raceConflicts: BlockConflictRef[] = [...preview.conflicts]
  for (const row of preview.willBlock) {
    if (!row.slotId) continue
    try {
      await blockOneSlot(row.slotId, opts.clubId, opts.guestData)
      blocked += 1
    } catch (err) {
      if (err instanceof SlotNotAvailableError) {
        raceConflicts.push({
          date: row.date,
          startTime: row.startTime,
          courtId: row.courtId,
          slotId: row.slotId,
          reason: 'CLAIM_RACE',
        })
        continue
      }
      throw err
    }
  }

  if (blocked === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'NO_BLOCKABLE_SLOTS',
      data: {
        willBlockCount: 0,
        skippedCount: raceConflicts.length,
        willBlock: [],
        conflicts: raceConflicts,
      },
    })
  }

  return {
    ok: true as const,
    count: blocked,
    skippedCount: raceConflicts.length,
    conflicts: raceConflicts,
  }
}
