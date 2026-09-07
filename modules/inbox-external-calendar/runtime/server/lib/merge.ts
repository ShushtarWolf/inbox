import type {
  ExternalCellState,
  ExternalOccupiedSlot,
  ExternalSourceId,
  InboxCalendarSlot,
  MergedCell,
} from './types'
import { formatSourceBadge } from './badges'
import { normalizeClockTime } from './time'
import { displayBlocksExternal } from '../../../lib/observation'
import { reconcileCellStates, slotKey, type ReconcileInputVerdict } from '../../../lib/reconcile'

export function isInboxOccupied(displayStatus: string): boolean {
  return displayStatus !== 'FREE'
    && displayStatus !== 'CANCELLED'
    && displayStatus !== 'CLOSED'
}

function normalizeSlotTime(value: string): string {
  return normalizeClockTime(value) ?? value.slice(0, 5)
}

function cellKey(courtId: string, startTime: string) {
  return `${courtId}:${normalizeSlotTime(startTime)}`
}

/**
 * Merge inbox + confirmed external busy slots.
 * External contribution sets occupied only for EXTERNAL_BUSY (caller must pass reconciled list).
 * Cells with no external busy → externalState AVAILABLE for external overlay.
 */
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
      startTime: normalizeSlotTime(slot.startTime),
      endTime: normalizeSlotTime(slot.endTime),
      inboxStatus: slot.displayStatus,
      sources,
      badge: formatSourceBadge(sources),
      occupied: sources.length > 0,
      externalState: 'AVAILABLE',
    })
  }

  for (const ext of externalSlots) {
    // Guard: only confirmed EXTERNAL_BUSY (or legacy rows without state) may paint.
    if (ext.state && ext.state !== 'EXTERNAL_BUSY') continue
    const key = cellKey(ext.courtKey, ext.startTime)
    let cell = map.get(key)
    if (!cell) {
      cell = {
        courtId: ext.courtKey,
        startTime: normalizeSlotTime(ext.startTime),
        endTime: normalizeSlotTime(ext.endTime),
        inboxStatus: 'FREE',
        sources: [],
        badge: '',
        occupied: false,
        externalState: 'AVAILABLE',
      }
      map.set(key, cell)
    }
    if (!cell.sources.includes(ext.source)) cell.sources.push(ext.source)
    cell.occupied = true
    cell.externalState = 'EXTERNAL_BUSY'
    cell.badge = formatSourceBadge(cell.sources)
  }

  return [...map.values()].sort((a, b) =>
    a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId),
  )
}

/**
 * Prefer when full per-source verdicts are available: annotate externalState from reconcile,
 * and only treat EXTERNAL_BUSY as external occupied contribution.
 */
export function mergeOccupancyFromVerdicts(
  inboxSlots: InboxCalendarSlot[],
  verdicts: ReconcileInputVerdict[],
  confirmedBusy: ExternalOccupiedSlot[],
): MergedCell[] {
  const cells = mergeOccupancy(inboxSlots, confirmedBusy)
  const states = reconcileCellStates(verdicts)
  for (const cell of cells) {
    const key = slotKey(cell.courtId, cell.startTime)
    const state = states.get(key)
    if (state) {
      cell.externalState = state
      // Re-assert occupied from external only when EXTERNAL_BUSY; inbox may still occupy.
      const externalBusy = displayBlocksExternal(state)
      const inboxBusy = cell.sources.includes('inbox')
      if (!externalBusy && !inboxBusy) {
        cell.occupied = false
        cell.sources = cell.sources.filter((s) => s === 'inbox')
        cell.badge = formatSourceBadge(cell.sources)
      } else if (!externalBusy && inboxBusy) {
        cell.sources = cell.sources.filter((s) => s === 'inbox')
        cell.occupied = true
        cell.badge = formatSourceBadge(cell.sources)
      }
    } else if (!cell.sources.some((s) => s !== 'inbox')) {
      cell.externalState = 'AVAILABLE'
    }
  }

  // Ensure cells that have verdicts but no inbox row still appear with correct externalState.
  for (const [key, state] of states) {
    if (cells.some((c) => slotKey(c.courtId, c.startTime) === key)) continue
    if (state === 'EXTERNAL_BUSY') continue // already created via confirmedBusy
    const [courtId, startTime] = key.split(':')
    if (!courtId || !startTime) continue
    cells.push({
      courtId,
      startTime,
      endTime: startTime,
      inboxStatus: 'FREE',
      sources: [],
      badge: '',
      occupied: false,
      externalState: state as ExternalCellState,
    })
  }

  return cells.sort((a, b) =>
    a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId),
  )
}
