import {
  classifyBlockCandidate,
  type BlockConflictRef,
  type BlockSlotRef,
} from '#shared/blockWeekly.ts'
import type { SeasonSessionOccurrence } from '#shared/seasonSessions.ts'
import { isSlotStartInPast } from '#shared/localDate.ts'
import { applyBlockSlotIds } from './blockWeekly'
import { hourFromTime } from './seasonSlots'
import { ensureSlotsForDate, formatHour } from './slots'
import { prisma } from './prisma'

export type SeasonBlockPreviewResult = {
  willBlock: BlockSlotRef[]
  willBlockCount: number
  conflicts: BlockConflictRef[]
  skippedCount: number
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

/** Dry-run season-range block for explicit session list. */
export async function previewSeasonBlock(opts: {
  clubId: string
  sessions: SeasonSessionOccurrence[]
}): Promise<SeasonBlockPreviewResult> {
  const courtCache = new Map<string, Awaited<ReturnType<typeof loadCourt>>>()
  const willBlock: BlockSlotRef[] = []
  const conflicts: BlockConflictRef[] = []
  const seen = new Set<string>()

  for (const session of opts.sessions) {
    const key = `${session.courtId}|${session.date}|${session.startTime}`
    if (seen.has(key)) continue
    seen.add(key)

    let court = courtCache.get(session.courtId)
    if (court === undefined) {
      court = await loadCourt(opts.clubId, session.courtId)
      courtCache.set(session.courtId, court)
    }
    const startTime = formatHour(hourFromTime(session.startTime))
    const date = session.date

    if (!court) {
      conflicts.push({ date, startTime, courtId: session.courtId, reason: 'MISSING' })
      continue
    }

    const hour = hourFromTime(startTime)
    const openHour = court.openHour ?? court.club.openHour
    const closeHour = court.closeHour ?? court.club.closeHour
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
  }
}

export async function applySeasonBlock(opts: {
  clubId: string
  sessions: SeasonSessionOccurrence[]
  acceptSkips: boolean
  guestData: GuestBlockData
}) {
  const preview = await previewSeasonBlock({
    clubId: opts.clubId,
    sessions: opts.sessions,
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

  const slotIds = preview.willBlock.map((row) => row.slotId).filter((id): id is string => Boolean(id))
  const result = await applyBlockSlotIds({
    clubId: opts.clubId,
    slotIds,
    guestData: opts.guestData,
  })

  return {
    ok: true as const,
    count: result.count,
    skippedCount: preview.skippedCount,
    conflicts: preview.conflicts,
  }
}
