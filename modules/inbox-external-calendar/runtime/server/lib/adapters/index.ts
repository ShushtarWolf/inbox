import type { ClubMapping, ExternalAdapterResult, ExternalOccupiedSlot } from '../types'
import { preferAloPlayOverAlovarzesh } from '../preferAloPlay'
import { findCourtMapping } from '../courtMatch'
import { fetchAloPlayOccupied } from './aloplay'
import { fetchAloVarzeshOccupancy } from './alovarzesh'
import { fetchCourticOccupancy } from './courtic'

function aloPlayMappedCourtIds(
  mapping: ClubMapping,
  courts: Array<{ id: string; nameFa: string; nameEn?: string | null }>,
): Set<string> {
  const ids = new Set<string>()
  for (const court of courts) {
    const mappingCourt = findCourtMapping(mapping, court)
    const aloplay = mappingCourt?.external?.aloplay
    const productId = aloplay?.productId ?? aloplay?.courtId
    if (productId != null) ids.add(court.id)
  }
  return ids
}

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

  const adapters: ExternalAdapterResult[] = []
  const occupied: ExternalOccupiedSlot[] = []

  const aloplay = await fetchAloPlayOccupied({
    mapping: opts.mapping,
    date: opts.date,
    courts: opts.courts,
    sessionDurationMinutes: opts.sessionDurationMinutes,
  })
  adapters.push({
    source: 'aloplay',
    occupied: aloplay.occupied,
    supported: aloplaySupported(opts.mapping),
    error: aloplay.error,
  })
  occupied.push(...aloplay.occupied)

  const alovarzesh = await fetchAloVarzeshOccupancy({
    mapping: opts.mapping,
    date: opts.date,
    courts: opts.courts,
    sessionDurationMinutes: opts.sessionDurationMinutes,
  })
  adapters.push(alovarzesh)
  const alovarzeshOccupied = preferAloPlayOverAlovarzesh(
    aloplay,
    alovarzesh.occupied,
    aloPlayMappedCourtIds(opts.mapping, opts.courts),
  )
  occupied.push(...alovarzeshOccupied)

  const courtic = await fetchCourticOccupancy()
  adapters.push(courtic)
  occupied.push(...courtic.occupied)

  return { occupied, adapters }
}

export { alovarzeshSupported, aloplaySupported }
