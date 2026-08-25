import type { ExternalOccupiedSlot, ExternalSourceId, InboxCalendarSlot, MergedCell } from './types'
import { formatSourceBadge } from './badges'

export function isInboxOccupied(displayStatus: string): boolean {
  return displayStatus !== 'FREE'
    && displayStatus !== 'CANCELLED'
    && displayStatus !== 'CLOSED'
}

function cellKey(courtId: string, startTime: string) {
  return `${courtId}:${startTime}`
}

export function mergeOccupancy(
  inboxSlots: InboxCalendarSlot[],
  externalSlots: ExternalOccupiedSlot[],
): MergedCell[] {
  const map = new Map<string, MergedCell>()

  for (const slot of inboxSlots) {
    const sources: ExternalSourceId[] = []
    if (isInboxOccupied(slot.displayStatus)) sources.push('inbox')
    map.set(cellKey(slot.courtId, slot.startTime), {
      courtId: slot.courtId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      inboxStatus: slot.displayStatus,
      sources,
      badge: formatSourceBadge(sources),
      occupied: sources.length > 0,
    })
  }

  for (const ext of externalSlots) {
    const key = cellKey(ext.courtKey, ext.startTime)
    let cell = map.get(key)
    if (!cell) {
      cell = {
        courtId: ext.courtKey,
        startTime: ext.startTime,
        endTime: ext.endTime,
        inboxStatus: 'FREE',
        sources: [],
        badge: '',
        occupied: false,
      }
      map.set(key, cell)
    }
    if (!cell.sources.includes(ext.source)) cell.sources.push(ext.source)
    cell.occupied = cell.sources.length > 0
    cell.badge = formatSourceBadge(cell.sources)
  }

  return [...map.values()].sort((a, b) =>
    a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId),
  )
}
