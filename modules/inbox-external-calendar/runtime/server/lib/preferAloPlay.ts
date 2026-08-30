import type { ExternalOccupiedSlot } from './types'

function occupancyKey(courtKey: string, startTime: string) {
  return `${courtKey}:${startTime.slice(0, 5)}`
}

/**
 * When AloPlay succeeded for a mapped court, its opinion wins over AloVarzesh.
 * Drop AloVarzesh occupied slots where AloPlay says free; keep when they agree or AloPlay errored.
 */
export function preferAloPlayOverAlovarzesh(
  aloplay: { occupied: ExternalOccupiedSlot[]; error?: string },
  alovarzeshOccupied: ExternalOccupiedSlot[],
  aloplayMappedCourts: Set<string>,
): ExternalOccupiedSlot[] {
  if (aloplay.error) return alovarzeshOccupied

  const aloplayKeys = new Set(
    aloplay.occupied.map((slot) => occupancyKey(slot.courtKey, slot.startTime)),
  )

  return alovarzeshOccupied.filter((slot) => {
    if (!aloplayMappedCourts.has(slot.courtKey)) return true
    return aloplayKeys.has(occupancyKey(slot.courtKey, slot.startTime))
  })
}
