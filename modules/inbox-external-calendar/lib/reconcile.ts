import type { ExternalCellState, SourceSlotVerdict } from './observation'
import { displayBlocksExternal } from './observation'

export type SourceName = 'aloplay' | 'alovarzesh' | 'courtic'

export type PerSourceVerdict = Partial<Record<SourceName, SourceSlotVerdict>>

/**
 * Cross-source reconciliation (availability-first).
 * Only EXTERNAL_BUSY when every contributing source that has a definite verdict
 * agrees BUSY, and at least one BUSY, with no FREE opposing.
 *
 * Spec mapping:
 * - both FREE → AVAILABLE
 * - both BUSY → EXTERNAL_BUSY
 * - BUSY + FREE → CONFLICT
 * - BUSY + UNKNOWN/STALE → UNKNOWN (do not block)
 * - FREE + UNKNOWN → UNKNOWN
 * - both UNKNOWN → UNKNOWN
 * - any STALE without confirmed dual BUSY → STALE or UNKNOWN
 */
export function reconcileSourceVerdicts(verdicts: PerSourceVerdict): ExternalCellState {
  const values = Object.values(verdicts).filter(Boolean) as SourceSlotVerdict[]
  if (!values.length) return 'UNKNOWN'

  const hasBusy = values.includes('BUSY')
  const hasFree = values.includes('FREE')
  const hasUnknown = values.includes('UNKNOWN')
  const hasStale = values.includes('STALE')

  if (hasBusy && hasFree) return 'CONFLICT'
  if (hasBusy && (hasUnknown || hasStale)) return 'UNKNOWN'
  if (hasBusy && !hasFree && !hasUnknown && !hasStale) return 'EXTERNAL_BUSY'
  if (hasFree && !hasBusy && !hasUnknown && !hasStale) return 'AVAILABLE'
  if (hasFree && (hasUnknown || hasStale) && !hasBusy) return 'UNKNOWN'
  if (hasStale && !hasBusy && !hasFree) return 'STALE'
  return 'UNKNOWN'
}

export function reconcileBlocksBooking(verdicts: PerSourceVerdict): boolean {
  return displayBlocksExternal(reconcileSourceVerdicts(verdicts))
}

export type SlotKey = string // courtId:HH:mm

export function slotKey(courtId: string, startTime: string): SlotKey {
  return `${courtId}:${startTime.slice(0, 5)}`
}

export type ReconcileInputVerdict = {
  courtKey: string
  startTime: string
  endTime?: string
  verdict: SourceSlotVerdict
  source: string
}

export type ReconciledBusySlot = {
  courtKey: string
  startTime: string
  endTime: string
  source: SourceName
  state: 'EXTERNAL_BUSY'
}

/**
 * Group per-source hour verdicts and emit occupied rows ONLY for EXTERNAL_BUSY.
 * Never a simple union of per-adapter busy lists.
 */
export function reconcileConfirmedBusy(
  slotVerdicts: ReconcileInputVerdict[],
  sessionDurationMinutes = 60,
): ReconciledBusySlot[] {
  type Acc = {
    courtKey: string
    startTime: string
    endTime: string
    perSource: PerSourceVerdict
  }
  const byKey = new Map<string, Acc>()

  for (const row of slotVerdicts) {
    const source = row.source as SourceName
    if (source !== 'aloplay' && source !== 'alovarzesh' && source !== 'courtic') continue
    const start = row.startTime.slice(0, 5)
    const key = slotKey(row.courtKey, start)
    let acc = byKey.get(key)
    if (!acc) {
      acc = {
        courtKey: row.courtKey,
        startTime: start,
        endTime: (row.endTime ?? addMinutesLocal(start, sessionDurationMinutes)).slice(0, 5),
        perSource: {},
      }
      byKey.set(key, acc)
    }
    if (row.endTime) acc.endTime = row.endTime.slice(0, 5)
    acc.perSource[source] = row.verdict
  }

  const out: ReconciledBusySlot[] = []
  for (const acc of byKey.values()) {
    const state = reconcileSourceVerdicts(acc.perSource)
    if (state !== 'EXTERNAL_BUSY') continue
    // Prefer first BUSY source for badge labeling; order aloplay → alovarzesh → courtic.
    const sourceOrder: SourceName[] = ['aloplay', 'alovarzesh', 'courtic']
    const busySource = sourceOrder.find((s) => acc.perSource[s] === 'BUSY') ?? 'aloplay'
    out.push({
      courtKey: acc.courtKey,
      startTime: acc.startTime,
      endTime: acc.endTime,
      source: busySource,
      state: 'EXTERNAL_BUSY',
    })
  }

  return out.sort((a, b) =>
    a.startTime.localeCompare(b.startTime) || a.courtKey.localeCompare(b.courtKey),
  )
}

/** Map of courtKey:startTime → reconciled ExternalCellState (for merge annotations). */
export function reconcileCellStates(
  slotVerdicts: ReconcileInputVerdict[],
): Map<string, ExternalCellState> {
  const byKey = new Map<string, PerSourceVerdict>()
  for (const row of slotVerdicts) {
    const source = row.source as SourceName
    if (source !== 'aloplay' && source !== 'alovarzesh' && source !== 'courtic') continue
    const key = slotKey(row.courtKey, row.startTime)
    const current = byKey.get(key) ?? {}
    current[source] = row.verdict
    byKey.set(key, current)
  }
  const out = new Map<string, ExternalCellState>()
  for (const [key, verdicts] of byKey) {
    out.set(key, reconcileSourceVerdicts(verdicts))
  }
  return out
}

function addMinutesLocal(startTime: string, minutes: number): string {
  const [h, m] = startTime.slice(0, 5).split(':').map(Number)
  const total = (h * 60 + m) + minutes
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
