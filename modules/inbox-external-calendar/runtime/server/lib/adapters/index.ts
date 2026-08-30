import type { ClubMapping, ExternalAdapterResult, ExternalOccupiedSlot } from '../types'
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
}): Promise<{ occupied: ExternalOccupiedSlot[]; adapters: ExternalAdapterResult[] }> {
  if (!opts.mapping) {
    return { occupied: [], adapters: [] }
  }

  const [aloplay, alovarzesh] = await Promise.all([
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

  const adapters: ExternalAdapterResult[] = [
    {
      source: 'aloplay',
      occupied: aloplay.occupied,
      supported: aloplaySupported(opts.mapping),
      error: aloplay.error,
    },
    alovarzesh,
  ]

  const occupied: ExternalOccupiedSlot[] = [
    ...aloplay.occupied,
    ...alovarzesh.occupied,
  ]

  const courtic = await fetchCourticOccupancy()
  adapters.push(courtic)
  occupied.push(...courtic.occupied)

  return { occupied, adapters }
}

export { alovarzeshSupported, aloplaySupported }
