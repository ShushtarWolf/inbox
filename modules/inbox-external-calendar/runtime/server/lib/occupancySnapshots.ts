import type { ExternalOccupancySource } from '@prisma/client'
import {
  isPersistableExternalSource,
  mergeLiveWithStoredOccupancy,
  type PersistableExternalSource,
} from '../../../lib/occupancySnapshots'
import type { ExternalOccupiedSlot, ExternalSourceId } from './types'

const SOURCE_TO_PRISMA: Record<PersistableExternalSource, ExternalOccupancySource> = {
  aloplay: 'ALOPLAY',
  alovarzesh: 'ALOVARZESH',
  courtic: 'COURTIC',
}

const PRISMA_TO_SOURCE: Record<ExternalOccupancySource, PersistableExternalSource> = {
  ALOPLAY: 'aloplay',
  ALOVARZESH: 'alovarzesh',
  COURTIC: 'courtic',
}

export { mergeLiveWithStoredOccupancy }

export async function persistExternalOccupancySnapshots(opts: {
  clubId: string
  date: string
  occupied: ExternalOccupiedSlot[]
}): Promise<void> {
  const now = new Date()
  const rows = opts.occupied.filter((slot) => isPersistableExternalSource(slot.source))
  if (!rows.length) return

  await Promise.all(rows.map(async (slot) => {
    const source = SOURCE_TO_PRISMA[slot.source as PersistableExternalSource]
    await prisma.externalOccupancySnapshot.upsert({
      where: {
        courtId_date_startTime_source: {
          courtId: slot.courtKey,
          date: opts.date,
          startTime: slot.startTime.slice(0, 5),
          source,
        },
      },
      create: {
        clubId: opts.clubId,
        courtId: slot.courtKey,
        date: opts.date,
        startTime: slot.startTime.slice(0, 5),
        endTime: slot.endTime.slice(0, 5),
        source,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        endTime: slot.endTime.slice(0, 5),
        lastSeenAt: now,
      },
    })
  }))
}

export async function loadExternalOccupancySnapshots(opts: {
  clubId: string
  date: string
}): Promise<ExternalOccupiedSlot[]> {
  const rows = await prisma.externalOccupancySnapshot.findMany({
    where: { clubId: opts.clubId, date: opts.date },
  })
  return rows.map((row) => ({
    courtKey: row.courtId,
    startTime: row.startTime,
    endTime: row.endTime,
    source: PRISMA_TO_SOURCE[row.source] as ExternalSourceId,
  }))
}

/** Persist live occupancy, then return live ∪ stored snapshots for this club+date. */
export async function persistAndMergeExternalOccupancy(opts: {
  clubId: string
  date: string
  liveOccupied: ExternalOccupiedSlot[]
}): Promise<ExternalOccupiedSlot[]> {
  await persistExternalOccupancySnapshots({
    clubId: opts.clubId,
    date: opts.date,
    occupied: opts.liveOccupied,
  })
  const stored = await loadExternalOccupancySnapshots({
    clubId: opts.clubId,
    date: opts.date,
  })
  return mergeLiveWithStoredOccupancy(opts.liveOccupied, stored) as ExternalOccupiedSlot[]
}
