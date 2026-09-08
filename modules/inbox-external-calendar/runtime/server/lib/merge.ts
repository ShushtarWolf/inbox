import type {
  ExternalCellState,
  ExternalOccupiedSlot,
  ExternalSourceId,
  InboxCalendarSlot,
  MergedCell,
} from './types'
import { formatExternalDisplayBadge, formatSourceBadge } from './badges'
import { normalizeClockTime } from './time'
import { displayBlocksExternal } from '../../../lib/observation'
import { classifyExternalDisplay } from '../../../lib/externalDisplay'
import {
  reconcileCellStates,
  reconcilePerSourceMap,
  slotKey,
  type ReconcileInputVerdict,
  type SourceName,
} from '../../../lib/reconcile'

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
      externalKind: 'clear',
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
        externalKind: 'clear',
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

function asExternalSourceId(source: SourceName): ExternalSourceId {
  return source
}

/**
 * Prefer when full per-source verdicts are available: annotate externalState + externalKind,
 * and only treat EXTERNAL_BUSY as external occupied contribution.
 */
export function mergeOccupancyFromVerdicts(
  inboxSlots: InboxCalendarSlot[],
  verdicts: ReconcileInputVerdict[],
  confirmedBusy: ExternalOccupiedSlot[],
): MergedCell[] {
  const cells = mergeOccupancy(inboxSlots, confirmedBusy)
  const states = reconcileCellStates(verdicts)
  const perSource = reconcilePerSourceMap(verdicts)
  const byKey = new Map(cells.map((c) => [slotKey(c.courtId, c.startTime), c] as const))

  for (const [key, cell] of byKey) {
    const verdict = perSource.get(key)
    if (verdict) {
      const info = classifyExternalDisplay(verdict)
      cell.externalState = info.reconciled
      cell.externalKind = info.kind
      cell.busySources = info.busySources.map(asExternalSourceId)
      cell.uncertainSources = info.uncertainSources.map(asExternalSourceId)

      const inboxBusy = cell.sources.includes('inbox')
      const externalBusy = displayBlocksExternal(info.reconciled)

      if (externalBusy) {
        // Ensure all BUSY sources appear (not only preferred first).
        const next: ExternalSourceId[] = inboxBusy ? ['inbox'] : []
        for (const s of info.busySources) {
          const id = asExternalSourceId(s)
          if (!next.includes(id)) next.push(id)
        }
        cell.sources = next
        cell.occupied = true
        cell.badge = formatExternalDisplayBadge(info.kind, next)
      } else if (info.kind === 'uncertain') {
        cell.sources = inboxBusy
          ? ['inbox', ...info.uncertainSources.map(asExternalSourceId)]
          : info.uncertainSources.map(asExternalSourceId)
        cell.occupied = inboxBusy
        cell.badge = formatExternalDisplayBadge('uncertain', cell.sources)
      } else if (!inboxBusy) {
        cell.occupied = false
        cell.sources = []
        cell.badge = ''
        cell.externalKind = 'clear'
      } else {
        cell.sources = ['inbox']
        cell.occupied = true
        cell.badge = formatSourceBadge(cell.sources)
        cell.externalKind = 'clear'
      }
    } else {
      const state = states.get(key)
      if (state) cell.externalState = state
      else if (!cell.sources.some((s) => s !== 'inbox')) {
        cell.externalState = 'AVAILABLE'
        cell.externalKind = 'clear'
      }
    }
  }

  // Ensure cells that have verdicts but no inbox row still appear with correct externalState.
  for (const [key, verdict] of perSource) {
    if (byKey.has(key)) continue
    const info = classifyExternalDisplay(verdict)
    if (info.kind === 'clear') continue
    const [courtId, startTime] = key.split(':')
    if (!courtId || !startTime) continue
    const sources: ExternalSourceId[] =
      info.kind === 'uncertain'
        ? info.uncertainSources.map(asExternalSourceId)
        : info.busySources.map(asExternalSourceId)
    cells.push({
      courtId,
      startTime,
      endTime: startTime,
      inboxStatus: 'FREE',
      sources,
      badge: formatExternalDisplayBadge(info.kind, sources),
      occupied: info.kind === 'busy_single' || info.kind === 'busy_multi',
      externalState: info.reconciled as ExternalCellState,
      externalKind: info.kind,
      busySources: info.busySources.map(asExternalSourceId),
      uncertainSources: info.uncertainSources.map(asExternalSourceId),
    })
  }

  return cells.sort((a, b) =>
    a.startTime.localeCompare(b.startTime) || a.courtId.localeCompare(b.courtId),
  )
}
