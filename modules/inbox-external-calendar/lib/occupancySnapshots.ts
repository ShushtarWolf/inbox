export type PersistableExternalSource = 'aloplay' | 'alovarzesh' | 'courtic'

export type SnapshotOccupiedSlot = {
  courtKey: string
  startTime: string
  endTime: string
  source: string
}

const PERSISTABLE_SOURCES: PersistableExternalSource[] = ['aloplay', 'alovarzesh', 'courtic']

export function isPersistableExternalSource(source: string): source is PersistableExternalSource {
  return (PERSISTABLE_SOURCES as string[]).includes(source)
}

export function occupancySnapshotKey(courtKey: string, startTime: string, source: string): string {
  return `${courtKey}:${startTime.slice(0, 5)}:${source}`
}

/** Union live adapter rows with durable DB snapshots (stored wins on same key). */
export function mergeLiveWithStoredOccupancy(
  live: SnapshotOccupiedSlot[],
  stored: SnapshotOccupiedSlot[],
): SnapshotOccupiedSlot[] {
  const map = new Map<string, SnapshotOccupiedSlot>()
  for (const slot of live) {
    if (!isPersistableExternalSource(slot.source)) continue
    map.set(occupancySnapshotKey(slot.courtKey, slot.startTime, slot.source), slot)
  }
  for (const slot of stored) {
    if (!isPersistableExternalSource(slot.source)) continue
    map.set(occupancySnapshotKey(slot.courtKey, slot.startTime, slot.source), slot)
  }
  return [...map.values()].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
    || a.courtKey.localeCompare(b.courtKey)
    || a.source.localeCompare(b.source),
  )
}
