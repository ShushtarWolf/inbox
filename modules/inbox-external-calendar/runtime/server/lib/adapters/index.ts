import { verdictsForReconcile } from '../../../../lib/padFailedSourceUnknown'
import { reconcileConfirmedBusy } from '../../../../lib/reconcile'
import type { ClubMapping, ExternalAdapterResult, ExternalOccupiedSlot } from '../types'
import { fetchAloPlayOccupied } from './aloplay'
import { fetchAloVarzeshOccupancy } from './alovarzesh'
import { fetchCourticOccupancy } from './courtic'

function aloplaySupported(mapping: ClubMapping): boolean {
  const source = mapping.sources?.aloplay
  if (!source || ('supported' in source && source.supported === false)) return false
  return source.clubId != null
}

function alovarzeshSupported(mapping: ClubMapping): boolean {
  const source = mapping.sources?.alovarzesh
  if (!source || ('supported' in source && source.supported === false)) return false
  return Boolean(mapping.courts?.some((court) => court.external?.alovarzesh?.productId != null))
}

/**
 * Fetch external occupancy with availability-first reconciliation.
 * `occupied` is confirmed EXTERNAL_BUSY after cross-source reconcile — NOT a raw union.
 * `persistOccupied` keeps per-adapter confirmed BUSY for snapshot persistence.
 *
 * Supported adapters that fail/wipe/total-fail with empty slotVerdicts are padded
 * as UNKNOWN (via health/completeness/error/anomalies). Successful empty stays silent.
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

  const aloplayOn = aloplaySupported(opts.mapping)
  const [aloplayRaw, alovarzesh] = await Promise.all([
    aloplayOn
      ? fetchAloPlayOccupied({
          mapping: opts.mapping,
          date: opts.date,
          courts: opts.courts,
          sessionDurationMinutes: opts.sessionDurationMinutes,
        })
      : Promise.resolve({
          source: 'aloplay' as const,
          occupied: [],
          supported: false,
          completeness: 'UNKNOWN' as const,
          health: 'OFFLINE' as const,
          slotVerdicts: [],
          error: 'AloPlay paused for this club (supported: false).',
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
    supported: aloplayOn,
  }

  const courtic = await fetchCourticOccupancy()
  const adapters: ExternalAdapterResult[] = [aloplay, alovarzesh, courtic]

  const allVerdicts = verdictsForReconcile({
    adapters,
    courts: opts.courts,
    sessionDurationMinutes: opts.sessionDurationMinutes,
  })
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
