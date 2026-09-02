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

export type ExternalAdapterLiveInput = {
  source: string
  supported: boolean
  occupied: unknown[]
  error?: string
}

/** Live adapter fetch succeeded — occupancy (including empty) is authoritative for this source. */
export function isExternalAdapterLiveSuccess(adapter: ExternalAdapterLiveInput): boolean {
  if (!adapter.supported || !isPersistableExternalSource(adapter.source)) return false
  if (adapter.error && adapter.occupied.length === 0) return false
  return true
}

export function buildLiveSucceededBySource(
  adapters: ExternalAdapterLiveInput[],
): Partial<Record<PersistableExternalSource, boolean>> {
  const result: Partial<Record<PersistableExternalSource, boolean>> = {}
  for (const adapter of adapters) {
    if (!isPersistableExternalSource(adapter.source)) continue
    result[adapter.source] = isExternalAdapterLiveSuccess(adapter)
  }
  return result
}

/**
 * Merge live adapter rows with durable DB snapshots.
 * When live succeeded for a source, live replaces stored for that source (occupancy can shrink).
 * When live failed, fall back to stored snapshots for that source only.
 */
export function mergeLiveWithStoredOccupancy(
  live: SnapshotOccupiedSlot[],
  stored: SnapshotOccupiedSlot[],
  liveSucceededBySource: Partial<Record<PersistableExternalSource, boolean>> = {},
): SnapshotOccupiedSlot[] {
  const liveBySource = new Map<PersistableExternalSource, SnapshotOccupiedSlot[]>()
  for (const slot of live) {
    if (!isPersistableExternalSource(slot.source)) continue
    const rows = liveBySource.get(slot.source) ?? []
    rows.push(slot)
    liveBySource.set(slot.source, rows)
  }

  const storedBySource = new Map<PersistableExternalSource, SnapshotOccupiedSlot[]>()
  for (const slot of stored) {
    if (!isPersistableExternalSource(slot.source)) continue
    const rows = storedBySource.get(slot.source) ?? []
    rows.push(slot)
    storedBySource.set(slot.source, rows)
  }

  const sources = new Set<PersistableExternalSource>([
    ...liveBySource.keys(),
    ...storedBySource.keys(),
    ...(Object.keys(liveSucceededBySource) as PersistableExternalSource[]),
  ])

  const merged: SnapshotOccupiedSlot[] = []
  for (const source of sources) {
    const succeeded = liveSucceededBySource[source]
    if (succeeded === true) {
      merged.push(...(liveBySource.get(source) ?? []))
    } else if (succeeded === false) {
      merged.push(...(storedBySource.get(source) ?? []))
    } else {
      merged.push(...(liveBySource.get(source) ?? []))
      for (const slot of storedBySource.get(source) ?? []) {
        const key = occupancySnapshotKey(slot.courtKey, slot.startTime, slot.source)
        if (!merged.some((row) => occupancySnapshotKey(row.courtKey, row.startTime, row.source) === key)) {
          merged.push(slot)
        }
      }
    }
  }

  return merged.sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
    || a.courtKey.localeCompare(b.courtKey)
    || a.source.localeCompare(b.source),
  )
}
