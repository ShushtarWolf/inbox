import type { ExternalOccupancySource } from '@prisma/client'
import {
  buildLiveSucceededBySource,
  isPersistableExternalSource,
  mergeLiveWithStoredOccupancy,
  type PersistableExternalSource,
} from '../../../lib/occupancySnapshots'
import type { ExternalAdapterResult, ExternalOccupiedSlot, ExternalSourceId } from './types'

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

export { mergeLiveWithStoredOccupancy, buildLiveSucceededBySource }

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

async function replaceExternalOccupancySnapshotsForSource(opts: {
  clubId: string
  date: string
  source: PersistableExternalSource
  occupied: ExternalOccupiedSlot[]
}): Promise<void> {
  await prisma.externalOccupancySnapshot.deleteMany({
    where: {
      clubId: opts.clubId,
      date: opts.date,
      source: SOURCE_TO_PRISMA[opts.source],
    },
  })
  await persistExternalOccupancySnapshots({
    clubId: opts.clubId,
    date: opts.date,
    occupied: opts.occupied,
  })
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

/**
 * When live fetch succeeds for a source, replace DB snapshots (occupancy can shrink).
 * When live fetch fails, keep last snapshots and use them as fallback.
 */
export async function persistAndMergeExternalOccupancy(opts: {
  clubId: string
  date: string
  liveOccupied: ExternalOccupiedSlot[]
  adapters: ExternalAdapterResult[]
}): Promise<ExternalOccupiedSlot[]> {
  const liveSucceededBySource = buildLiveSucceededBySource(opts.adapters)

  for (const source of ['aloplay', 'alovarzesh', 'courtic'] as PersistableExternalSource[]) {
    if (!liveSucceededBySource[source]) continue
    const sourceLive = opts.liveOccupied.filter((slot) => slot.source === source)
    await replaceExternalOccupancySnapshotsForSource({
      clubId: opts.clubId,
      date: opts.date,
      source,
      occupied: sourceLive,
    })
  }

  const stored = await loadExternalOccupancySnapshots({
    clubId: opts.clubId,
    date: opts.date,
  })
  return mergeLiveWithStoredOccupancy(opts.liveOccupied, stored, liveSucceededBySource) as ExternalOccupiedSlot[]
}
