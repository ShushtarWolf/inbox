import type { ClubMapping } from '../types'
import type { ExternalOccupiedSlot } from './types'
import { findCourtMapping } from './courtMatch'
import { normalizeClockTime } from './time'

function normalizeOccupiedSlot(slot: ExternalOccupiedSlot): ExternalOccupiedSlot {
  return {
    ...slot,
    startTime: normalizeClockTime(slot.startTime) ?? slot.startTime.slice(0, 5),
    endTime: normalizeClockTime(slot.endTime) ?? slot.endTime.slice(0, 5),
  }
}

/** Re-bind cached/snapshot court UUIDs to current Inbox courts; normalize clock times. */
export async function remapExternalOccupancyCourtKeys(opts: {
  courts: Array<{ id: string; nameFa: string; nameEn?: string | null }>
  mapping: ClubMapping | null
  occupied: ExternalOccupiedSlot[]
}): Promise<ExternalOccupiedSlot[]> {
  const normalized = opts.occupied.map(normalizeOccupiedSlot)
  const currentIds = new Set(opts.courts.map((court) => court.id))
  const orphanKeys = [...new Set(
    normalized.map((slot) => slot.courtKey).filter((key) => !currentIds.has(key)),
  )]
  if (!orphanKeys.length) return normalized

  const orphanCourts = await prisma.court.findMany({
    where: { id: { in: orphanKeys } },
    select: { id: true, nameFa: true, nameEn: true },
  })
  const remap = new Map<string, string>()

  for (const orphan of orphanCourts) {
    const target = opts.courts.find((court) => {
      if (court.nameFa === orphan.nameFa) return true
      const orphanMapping = findCourtMapping(opts.mapping, orphan)
      const courtMapping = findCourtMapping(opts.mapping, court)
      if (!orphanMapping?.inboxCourtName || !courtMapping?.inboxCourtName) return false
      return orphanMapping.inboxCourtName === courtMapping.inboxCourtName
    })
    if (target) remap.set(orphan.id, target.id)
  }

  return normalized.map((slot) => ({
    ...slot,
    courtKey: remap.get(slot.courtKey) ?? slot.courtKey,
  }))
}
