/** Calendar-module observation states (availability-first). */

export type Completeness = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN'

export type ExternalCellState =
  | 'AVAILABLE'
  | 'EXTERNAL_BUSY'
  | 'UNKNOWN'
  | 'STALE'
  | 'CONFLICT'

export type SourceHealth = 'HEALTHY' | 'DEGRADED' | 'SUSPICIOUS' | 'OFFLINE'

export type SourceSlotVerdict = 'FREE' | 'BUSY' | 'UNKNOWN' | 'STALE'

/** Display invariant: only confirmed EXTERNAL_BUSY blocks. */
export function displayBlocksExternal(state: ExternalCellState): boolean {
  return state === 'EXTERNAL_BUSY'
}

export function displayIsAvailable(state: ExternalCellState): boolean {
  return state !== 'EXTERNAL_BUSY'
}
