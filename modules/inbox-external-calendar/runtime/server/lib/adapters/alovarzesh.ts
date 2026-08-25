import { isoToJalaali } from '#shared/jalali.ts'
import { parseAloVarzeshOccupiedTimes } from '../../../../lib/alovarzeshParse'
import type { ClubMapping, ExternalAdapterResult, ExternalOccupiedSlot } from '../types'
import { readCached, writeCached } from '../cache'
import { findCourtMapping } from '../courtMatch'
import { checkAdapterRateLimit } from '../rateLimit'
import { addMinutes } from '../time'

const ALOVARZESH_BASE = 'https://alo-varzesh.com'

export { parseAloVarzeshOccupiedTimes }

/** Convert Gregorian YYYY-MM-DD → Jalali YYYY-MM-DD used in AloVarzesh product_schedule. */
export function gregorianToJalaliDate(isoDate: string): string {
  const { jy, jm, jd } = isoToJalaali(isoDate)
  return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`
}

function mappingHasAlovarzesh(mapping: ClubMapping): boolean {
  const source = mapping.sources?.alovarzesh
  if (!source || ('supported' in source && source.supported === false)) return false
  return Boolean(mapping.courts?.some((court) => court.external?.alovarzesh?.productId != null))
}

async function fetchProductHtml(productId: number, gregorianDate: string): Promise<string> {
  const url = `${ALOVARZESH_BASE}/products/${productId}?tt_start=${encodeURIComponent(gregorianDate)}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; InboxExternalCalendar/1.0)',
    },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(`AloVarzesh product ${productId} HTTP ${response.status}`)
  }
  return await response.text()
}

export async function fetchAloVarzeshOccupancy(opts: {
  mapping: ClubMapping
  date: string
  courts: Array<{
    id: string
    nameFa: string
  }>
  sessionDurationMinutes: number
}): Promise<ExternalAdapterResult> {
  if (!mappingHasAlovarzesh(opts.mapping)) {
    return {
      source: 'alovarzesh',
      occupied: [],
      supported: false,
      error: 'الوورزش mapping is not configured for this club.',
    }
  }

  const cacheKey = `ext-cal:alovarzesh:${opts.mapping.inboxSlug}:${opts.date}`
  const cached = await readCached<ExternalOccupiedSlot[]>(cacheKey)
  if (cached) {
    return { source: 'alovarzesh', occupied: cached, supported: true }
  }

  const limit = checkAdapterRateLimit(`alovarzesh:${opts.mapping.inboxSlug}`)
  if (!limit.allowed) {
    return {
      source: 'alovarzesh',
      occupied: [],
      supported: true,
      error: 'الوورزش rate limited — retry shortly.',
    }
  }

  const jalaliDate = gregorianToJalaliDate(opts.date)
  const occupied: ExternalOccupiedSlot[] = []
  const errors: string[] = []

  for (const court of opts.courts) {
    const mappingCourt = findCourtMapping(opts.mapping, court)
    const productId = mappingCourt?.external?.alovarzesh?.productId
    if (productId == null) continue

    try {
      const html = await fetchProductHtml(productId, opts.date)
      const times = parseAloVarzeshOccupiedTimes(html, jalaliDate)
      for (const startTime of times) {
        occupied.push({
          courtKey: court.id,
          startTime,
          endTime: addMinutes(startTime, opts.sessionDurationMinutes),
          source: 'alovarzesh',
        })
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `product ${productId} failed`)
    }
  }

  if (!occupied.length && errors.length) {
    return {
      source: 'alovarzesh',
      occupied: [],
      supported: true,
      error: errors.join('; '),
    }
  }

  await writeCached(cacheKey, occupied)
  return {
    source: 'alovarzesh',
    occupied,
    supported: true,
    error: errors.length ? errors.join('; ') : undefined,
  }
}
