import {
  classifyBlockCandidate,
  classifyUnblockCandidate,
  expandWeeklyAnchorOccurrences,
  type BlockConflictRef,
  type BlockSlotRef,
  type UnblockConflictRef,
  type WeeklyBlockAnchor,
} from '#shared/blockWeekly.ts'
import { isSlotStartInPast } from '#shared/localDate.ts'
import { clampWeeklyWeeks } from '#shared/weeklyOccurrences.ts'
import { SlotNotAvailableError } from './prismaErrors'
import { prisma } from './prisma'
import { activeSlotBooking } from './reservations'
import { hourFromTime } from './seasonSlots'
import { ensureSlotsForDate, formatHour } from './slots'
import { deleteStaleCancelledBooking } from './staleBooking'
import { cancelCourtBooking } from './cancellations'

export type WeeklyBlockPreviewResult = {
  willBlock: BlockSlotRef[]
  willBlockCount: number
  conflicts: BlockConflictRef[]
  skippedCount: number
  weeks: number
  anchorCount: number
}

export type WeeklyUnblockPreviewResult = {
  willUnblock: BlockSlotRef[]
  willUnblockCount: number
  conflicts: UnblockConflictRef[]
  skippedCount: number
  weeks: number
  anchorCount: number
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

const courtCache = new Map<string, Awaited<ReturnType<typeof loadCourt>>>()

async function getCourt(clubId: string, courtId: string) {
  const key = `${clubId}:${courtId}`
  if (!courtCache.has(key)) {
    courtCache.set(key, await loadCourt(clubId, courtId))
  }
  return courtCache.get(key)!
}

/** Dry-run: classify each weekly occurrence as blockable or conflict. */
export async function previewWeeklyBlock(opts: {
  clubId: string
  anchors: WeeklyBlockAnchor[]
  weeks: number
}): Promise<WeeklyBlockPreviewResult> {
  courtCache.clear()
  const weeks = clampWeeklyWeeks(opts.weeks)
  const anchors = opts.anchors.filter((a) => a.courtId && a.anchorDate && a.startTime)
  const occurrences = expandWeeklyAnchorOccurrences(anchors, weeks)
  const willBlock: BlockSlotRef[] = []
  const conflicts: BlockConflictRef[] = []

  for (const row of occurrences) {
    const startTime = formatHour(hourFromTime(row.startTime))
    const court = await getCourt(opts.clubId, row.courtId)
    const date = row.date

    if (!court) {
      conflicts.push({ date, startTime, courtId: row.courtId, reason: 'MISSING' })
      continue
    }

    const openHour = court.openHour ?? court.club.openHour
    const closeHour = court.closeHour ?? court.club.closeHour
    const hour = hourFromTime(startTime)

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
    anchorCount: anchors.length,
  }
}

/** Dry-run weekly unblock for the same anchor pattern. */
export async function previewWeeklyUnblock(opts: {
  clubId: string
  anchors: WeeklyBlockAnchor[]
  weeks: number
}): Promise<WeeklyUnblockPreviewResult> {
  courtCache.clear()
  const weeks = clampWeeklyWeeks(opts.weeks)
  const anchors = opts.anchors.filter((a) => a.courtId && a.anchorDate && a.startTime)
  const occurrences = expandWeeklyAnchorOccurrences(anchors, weeks)
  const willUnblock: BlockSlotRef[] = []
  const conflicts: UnblockConflictRef[] = []

  for (const row of occurrences) {
    const startTime = formatHour(hourFromTime(row.startTime))
    const date = row.date
    await ensureSlotsForDate(opts.clubId, date)
    const existing = await prisma.slot.findFirst({
      where: { courtId: row.courtId, date, startTime, displayStatus: { not: 'CANCELLED' } },
      include: { booking: true },
    })
    if (!existing) {
      conflicts.push({ date, startTime, courtId: row.courtId, reason: 'MISSING' })
      continue
    }

    const verdict = classifyUnblockCandidate({
      displayStatus: existing.displayStatus,
      bookingSource: existing.booking?.source,
      bookingStatus: existing.booking?.status,
    })
    if (verdict === 'UNBLOCKABLE') {
      willUnblock.push({ date, startTime, courtId: row.courtId, slotId: existing.id })
      continue
    }
    conflicts.push({
      date,
      startTime,
      courtId: row.courtId,
      slotId: existing.id,
      reason: verdict === 'NOT_CLUB' ? 'NOT_CLUB' : 'NOT_BLOCKED',
    })
  }

  return {
    willUnblock,
    willUnblockCount: willUnblock.length,
    conflicts,
    skippedCount: conflicts.length,
    weeks,
    anchorCount: anchors.length,
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
      await deleteStaleCancelledBooking(tx, staleCancelled.id)
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

async function unblockOneSlot(slotId: string, clubId: string) {
  const slot = await prisma.slot.findFirst({
    where: { id: slotId, court: { clubId }, displayStatus: 'BLOCKED' },
    include: { booking: { include: { payment: true } } },
  })
  if (!slot) throw createError({ statusCode: 404, statusMessage: 'Blocked slot not found' })

  if (classifyUnblockCandidate({
    displayStatus: slot.displayStatus,
    bookingSource: slot.booking?.source,
    bookingStatus: slot.booking?.status,
  }) !== 'UNBLOCKABLE') {
    throw createError({ statusCode: 409, statusMessage: 'SLOT_NOT_UNBLOCKABLE' })
  }

  if (slot.booking) {
    await cancelCourtBooking({
      bookingId: slot.booking.id,
      slotId: slot.id,
      reason: 'owner-unblock',
      paymentId: slot.booking.payment?.id,
      userId: slot.booking.userId,
    })
  } else {
    await prisma.slot.update({
      where: { id: slot.id },
      data: { displayStatus: 'FREE' },
    })
  }
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

/** Unblock explicit slot ids (single-day / multi-select path). */
export async function applyUnblockSlotIds(opts: {
  clubId: string
  slotIds: string[]
}) {
  for (const slotId of opts.slotIds) {
    await unblockOneSlot(slotId, opts.clubId)
  }
  return { ok: true as const, count: opts.slotIds.length }
}

/**
 * Weekly block from anchor slot(s): preview → block willBlock ids.
 * Soft-skips conflicts when acceptSkips; otherwise 409 with preview payload.
 */
export async function applyWeeklyBlock(opts: {
  clubId: string
  anchors: WeeklyBlockAnchor[]
  weeks: number
  acceptSkips: boolean
  guestData: GuestBlockData
}) {
  const preview = await previewWeeklyBlock({
    clubId: opts.clubId,
    anchors: opts.anchors,
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

/** Weekly unblock from anchor slot(s) with the same soft-skip rules. */
export async function applyWeeklyUnblock(opts: {
  clubId: string
  anchors: WeeklyBlockAnchor[]
  weeks: number
  acceptSkips: boolean
}) {
  const preview = await previewWeeklyUnblock({
    clubId: opts.clubId,
    anchors: opts.anchors,
    weeks: opts.weeks,
  })

  if (preview.willUnblockCount === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'NO_UNBLOCKABLE_SLOTS',
      data: {
        willUnblockCount: 0,
        skippedCount: preview.skippedCount,
        willUnblock: preview.willUnblock,
        conflicts: preview.conflicts,
      },
    })
  }

  if (preview.skippedCount > 0 && !opts.acceptSkips) {
    throw createError({
      statusCode: 409,
      statusMessage: 'UNBLOCK_CONFLICTS_NEED_CONFIRM',
      data: {
        willUnblockCount: preview.willUnblockCount,
        skippedCount: preview.skippedCount,
        willUnblock: preview.willUnblock,
        conflicts: preview.conflicts,
      },
    })
  }

  let unblocked = 0
  const raceConflicts: UnblockConflictRef[] = [...preview.conflicts]
  for (const row of preview.willUnblock) {
    if (!row.slotId) continue
    try {
      await unblockOneSlot(row.slotId, opts.clubId)
      unblocked += 1
    } catch (err) {
      const status = (err as { statusCode?: number; statusMessage?: string }).statusMessage
      if (status === 'SLOT_NOT_UNBLOCKABLE' || status === 'Blocked slot not found') {
        raceConflicts.push({
          date: row.date,
          startTime: row.startTime,
          courtId: row.courtId,
          slotId: row.slotId,
          reason: 'NOT_BLOCKED',
        })
        continue
      }
      throw err
    }
  }

  if (unblocked === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'NO_UNBLOCKABLE_SLOTS',
      data: {
        willUnblockCount: 0,
        skippedCount: raceConflicts.length,
        willUnblock: [],
        conflicts: raceConflicts,
      },
    })
  }

  return {
    ok: true as const,
    count: unblocked,
    skippedCount: raceConflicts.length,
    conflicts: raceConflicts,
  }
}

/** Load weekly anchors from slot ids (preserves caller order, dedupes ids). */
export async function weeklyAnchorsFromSlotIds(clubId: string, slotIds: string[]): Promise<WeeklyBlockAnchor[]> {
  const ids = [...new Set(slotIds.map((id) => String(id).trim()).filter(Boolean))]
  if (!ids.length) return []
  const slots = await prisma.slot.findMany({
    where: { id: { in: ids }, court: { clubId } },
    select: { id: true, courtId: true, date: true, startTime: true },
  })
  const byId = new Map(slots.map((s) => [s.id, s]))
  return ids
    .map((id) => byId.get(id))
    .filter((s): s is NonNullable<typeof s> => s != null)
    .map((s) => ({
      courtId: s.courtId,
      anchorDate: s.date,
      startTime: s.startTime,
    }))
}
