import type { ExternalCellState, SourceSlotVerdict } from './observation'
import { displayBlocksExternal } from './observation'

export type SourceName = 'aloplay' | 'alovarzesh' | 'courtic'

export type PerSourceVerdict = Partial<Record<SourceName, SourceSlotVerdict>>

/**
 * Cross-source reconciliation (double-book prevention).
 * Any definite BUSY from a source blocks the cell as EXTERNAL_BUSY —
 * even if another source says FREE or UNKNOWN.
 *
 * Confident BUSY still comes only from adapter COMPLETE/confirmed paths;
 * wipe/fail emit UNKNOWN and do not invent BUSY by themselves.
 *
 * Spec mapping:
 * - any BUSY (+ FREE / UNKNOWN / STALE / alone) → EXTERNAL_BUSY
 * - both FREE → AVAILABLE
 * - FREE + UNKNOWN/STALE → UNKNOWN
 * - both UNKNOWN → UNKNOWN
 * - only STALE → STALE
 */
export function reconcileSourceVerdicts(verdicts: PerSourceVerdict): ExternalCellState {
  const values = Object.values(verdicts).filter(Boolean) as SourceSlotVerdict[]
  if (!values.length) return 'UNKNOWN'

  const hasBusy = values.includes('BUSY')
  const hasFree = values.includes('FREE')
  const hasUnknown = values.includes('UNKNOWN')
  const hasStale = values.includes('STALE')

  // One confident external reservation is enough to block Inboxs booking.
  if (hasBusy) return 'EXTERNAL_BUSY'
  if (hasFree && !hasUnknown && !hasStale) return 'AVAILABLE'
  if (hasFree && (hasUnknown || hasStale)) return 'UNKNOWN'
  if (hasStale && !hasFree) return 'STALE'
  return 'UNKNOWN'
}

export function reconcileBlocksBooking(verdicts: PerSourceVerdict): boolean {
  return displayBlocksExternal(reconcileSourceVerdicts(verdicts))
}

export type SlotKey = string // courtId:HH:mm

export function slotKey(courtId: string, startTime: string): string {
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
 * Never a simple union of raw adapter lists without verdict reconciliation —
 * but any contributing BUSY is enough to confirm EXTERNAL_BUSY.
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
  const sourceOrder: SourceName[] = ['aloplay', 'alovarzesh', 'courtic']
  for (const acc of byKey.values()) {
    const state = reconcileSourceVerdicts(acc.perSource)
    if (state !== 'EXTERNAL_BUSY') continue
    // One row per confident BUSY source so UI can show single vs multi.
    for (const source of sourceOrder) {
      if (acc.perSource[source] !== 'BUSY') continue
      out.push({
        courtKey: acc.courtKey,
        startTime: acc.startTime,
        endTime: acc.endTime,
        source,
        state: 'EXTERNAL_BUSY',
      })
    }
  }

  return out.sort((a, b) =>
    a.startTime.localeCompare(b.startTime) || a.courtKey.localeCompare(b.courtKey),
  )
}


/** Map of courtKey:startTime → per-source verdicts (for staff display kinds). */
export function reconcilePerSourceMap(
  slotVerdicts: ReconcileInputVerdict[],
): Map<string, PerSourceVerdict> {
  const byKey = new Map<string, PerSourceVerdict>()
  for (const row of slotVerdicts) {
    const source = row.source as SourceName
    if (source !== 'aloplay' && source !== 'alovarzesh' && source !== 'courtic') continue
    const key = slotKey(row.courtKey, row.startTime)
    const current = byKey.get(key) ?? {}
    current[source] = row.verdict
    byKey.set(key, current)
  }
  return byKey
}

/** Map of courtKey:startTime → reconciled ExternalCellState (for merge annotations). */
export function reconcileCellStates(
  slotVerdicts: ReconcileInputVerdict[],
): Map<string, ExternalCellState> {
  const byKey = reconcilePerSourceMap(slotVerdicts)
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
