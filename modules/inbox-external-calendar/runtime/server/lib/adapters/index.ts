import type { ClubMapping, ExternalAdapterResult, ExternalOccupiedSlot } from '../types'
import { fetchAloPlayOccupied } from './aloplay'
import { fetchAloVarzeshOccupancy } from './alovarzesh'
import { fetchCourticOccupancy } from './courtic'

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
    supported: opts.mapping.sources?.aloplay?.clubId != null,
    error: aloplay.error,
  })
  occupied.push(...aloplay.occupied)

  const alovarzesh = await fetchAloVarzeshOccupancy()
  adapters.push(alovarzesh)
  occupied.push(...alovarzesh.occupied)

  const courtic = await fetchCourticOccupancy()
  adapters.push(courtic)
  occupied.push(...courtic.occupied)

  return { occupied, adapters }
}
