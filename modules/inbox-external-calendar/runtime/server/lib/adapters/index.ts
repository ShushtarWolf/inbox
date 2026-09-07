import { reconcileConfirmedBusy } from '../../../../lib/reconcile'
import type { AdapterSlotVerdict, ClubMapping, ExternalAdapterResult, ExternalOccupiedSlot } from '../types'
import { fetchAloPlayOccupied } from './aloplay'
import { fetchAloVarzeshOccupancy } from './alovarzesh'
import { fetchCourticOccupancy } from './courtic'

function aloplaySupported(mapping: ClubMapping): boolean {
  return mapping.sources?.aloplay?.clubId != null
}

function alovarzeshSupported(mapping: ClubMapping): boolean {
  const source = mapping.sources?.alovarzesh
  if (!source || ('supported' in source && source.supported === false)) return false
  return Boolean(mapping.courts?.some((court) => court.external?.alovarzesh?.productId != null))
}

function occupiedAsBusyVerdicts(adapter: ExternalAdapterResult): AdapterSlotVerdict[] {
  if (adapter.slotVerdicts?.length) return adapter.slotVerdicts
  return adapter.occupied.map((slot) => ({
    courtKey: slot.courtKey,
    startTime: slot.startTime,
    endTime: slot.endTime,
    verdict: 'BUSY' as const,
    source: adapter.source,
  }))
}

/**
 * Fetch external occupancy with availability-first reconciliation.
 * `occupied` is confirmed EXTERNAL_BUSY after cross-source reconcile — NOT a raw union.
 * `persistOccupied` keeps per-adapter confirmed BUSY for snapshot persistence.
 */
export async function fetchExternalOccupancy(opts: {
  mapping: ClubMapping | null
  date: string
  courts: Array<{
    id: string
    nameFa: string
    effectiveOpenHour: number
    effectiveCloseHour: number
  }>
  sessionDurationMinutes: number
}): Promise<{
  occupied: ExternalOccupiedSlot[]
  adapters: ExternalAdapterResult[]
  persistOccupied: ExternalOccupiedSlot[]
}> {
  if (!opts.mapping) {
    return { occupied: [], adapters: [], persistOccupied: [] }
  }

  const [aloplayRaw, alovarzesh] = await Promise.all([
    fetchAloPlayOccupied({
      mapping: opts.mapping,
      date: opts.date,
      courts: opts.courts,
      sessionDurationMinutes: opts.sessionDurationMinutes,
    }),
    fetchAloVarzeshOccupancy({
      mapping: opts.mapping,
      date: opts.date,
      courts: opts.courts,
      sessionDurationMinutes: opts.sessionDurationMinutes,
    }),
  ])

  const aloplay: ExternalAdapterResult = {
    ...aloplayRaw,
    source: 'aloplay',
    supported: aloplaySupported(opts.mapping),
  }

  const courtic = await fetchCourticOccupancy()
  const adapters: ExternalAdapterResult[] = [aloplay, alovarzesh, courtic]

  const allVerdicts = adapters.flatMap(occupiedAsBusyVerdicts)
  const reconciled = reconcileConfirmedBusy(allVerdicts, opts.sessionDurationMinutes)

  const occupied: ExternalOccupiedSlot[] = reconciled.map((row) => ({
    courtKey: row.courtKey,
    startTime: row.startTime,
    endTime: row.endTime,
    source: row.source,
    state: 'EXTERNAL_BUSY',
  }))

  const persistOccupied: ExternalOccupiedSlot[] = [
    ...aloplay.occupied,
    ...alovarzesh.occupied,
    ...courtic.occupied,
  ]

  return { occupied, adapters, persistOccupied }
}

export { alovarzeshSupported, aloplaySupported, reconcileConfirmedBusy }
