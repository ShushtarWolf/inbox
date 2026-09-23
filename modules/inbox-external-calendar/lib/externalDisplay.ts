import type { ExternalCellState } from './observation'
import type { PerSourceVerdict, SourceName } from './reconcile'
import { reconcileSourceVerdicts } from './reconcile'

/** Staff calendar overlay: three visible external modes. */
export type ExternalDisplayKind = 'busy_single' | 'busy_multi' | 'uncertain' | 'clear'

export type ExternalDisplayInfo = {
  kind: ExternalDisplayKind
  /** Sources with definite BUSY */
  busySources: SourceName[]
  /** Sources that are UNKNOWN/STALE (uncertainty) */
  uncertainSources: SourceName[]
  reconciled: ExternalCellState
}

const SOURCE_ORDER: SourceName[] = ['aloplay', 'alovarzesh', 'courtic']

export function classifyExternalDisplay(perSource: PerSourceVerdict): ExternalDisplayInfo {
  const busySources = SOURCE_ORDER.filter((s) => perSource[s] === 'BUSY')
  const uncertainSources = SOURCE_ORDER.filter(
    (s) => perSource[s] === 'UNKNOWN' || perSource[s] === 'STALE',
  )
  const reconciled = reconcileSourceVerdicts(perSource)

  if (busySources.length >= 2) {
    return { kind: 'busy_multi', busySources, uncertainSources, reconciled }
  }
  if (busySources.length === 1) {
    return { kind: 'busy_single', busySources, uncertainSources, reconciled }
  }
  if (uncertainSources.length > 0 || reconciled === 'UNKNOWN' || reconciled === 'STALE') {
    return { kind: 'uncertain', busySources, uncertainSources, reconciled }
  }
  return { kind: 'clear', busySources, uncertainSources, reconciled }
}
