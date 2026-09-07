import { isoToJalaali } from '#shared/jalali.ts'
import { parseAloVarzeshOccupiedTimes, parseAloVarzeshSlotStates } from '../../../../lib/alovarzeshParse'
import type {
  AdapterSlotVerdict,
  ClubMapping,
  ExternalAdapterResult,
  ExternalOccupiedSlot,
} from '../types'
import { readCached, writeCached } from '../cache'
import { findCourtMapping } from '../courtMatch'
import { checkAdapterRateLimit } from '../rateLimit'
import { addMinutes, buildSessionStarts } from '../time'
import { formatGregorianDateInTimeZone } from '../../../../lib/aloplaySession'

const ALOVARZESH_BASE = 'https://alo-varzesh.com'

export { parseAloVarzeshOccupiedTimes, parseAloVarzeshSlotStates }

/** Convert Gregorian YYYY-MM-DD → Jalali YYYY-MM-DD used in AloVarzesh product_schedule. */
export function gregorianToJalaliDate(isoDate: string): string {
  const { jy, jm, jd } = isoToJalaali(isoDate)
  return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`
}

const TEHRAN_TIME_ZONE = 'Asia/Tehran'

/** Current HH:00 in Tehran — past public slots before this are not treated as reserved. */
export function tehranIgnoreBeforeHour(now: Date = new Date()): string {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: TEHRAN_TIME_ZONE,
    hour: '2-digit',
    hour12: false,
  }).format(now)
  const n = Number.parseInt(hour, 10)
  return `${String(Number.isFinite(n) ? n : 0).padStart(2, '0')}:00`
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
    effectiveOpenHour?: number
    effectiveCloseHour?: number
  }>
  sessionDurationMinutes: number
}): Promise<ExternalAdapterResult> {
  if (!mappingHasAlovarzesh(opts.mapping)) {
    return {
      source: 'alovarzesh',
      occupied: [],
      supported: false,
      error: 'الوورزش mapping is not configured for this club.',
      completeness: 'UNKNOWN',
      health: 'OFFLINE',
      slotVerdicts: [],
    }
  }

  const cacheKey = `ext-cal:alovarzesh:${opts.mapping.inboxSlug}:${opts.date}:v3`
  const cached = await readCached<{
    occupied: ExternalOccupiedSlot[]
    slotVerdicts: AdapterSlotVerdict[]
  }>(cacheKey)
  if (cached?.occupied && cached.slotVerdicts) {
    return {
      source: 'alovarzesh',
      occupied: cached.occupied,
      supported: true,
      completeness: 'COMPLETE',
      health: 'HEALTHY',
      slotVerdicts: cached.slotVerdicts,
    }
  }

  const limit = checkAdapterRateLimit(`alovarzesh:${opts.mapping.inboxSlug}`)
  if (!limit.allowed) {
    return {
      source: 'alovarzesh',
      occupied: [],
      supported: true,
      error: 'الوورزش rate limited — retry shortly.',
      completeness: 'UNKNOWN',
      health: 'DEGRADED',
      slotVerdicts: [],
      anomalies: ['rate_limited'],
    }
  }

  const jalaliDate = gregorianToJalaliDate(opts.date)
  const todayTehran = formatGregorianDateInTimeZone(new Date(), TEHRAN_TIME_ZONE)
  const ignoreBefore = opts.date === todayTehran ? tehranIgnoreBeforeHour() : null
  const occupied: ExternalOccupiedSlot[] = []
  const slotVerdicts: AdapterSlotVerdict[] = []
  const errors: string[] = []
  let anySuccess = false

  for (const court of opts.courts) {
    const mappingCourt = findCourtMapping(opts.mapping, court)
    const productId = mappingCourt?.external?.alovarzesh?.productId
    if (productId == null) {
      const open = court.effectiveOpenHour ?? 7
      const close = court.effectiveCloseHour ?? 23
      const starts = buildSessionStarts(open, close, opts.sessionDurationMinutes)
      for (const startTime of starts) {
        slotVerdicts.push({
          courtKey: court.id,
          startTime,
          endTime: addMinutes(startTime, opts.sessionDurationMinutes),
          verdict: 'UNKNOWN',
          source: 'alovarzesh',
        })
      }
      continue
    }

    try {
      const html = await fetchProductHtml(productId, opts.date)
      const states = parseAloVarzeshSlotStates(html, jalaliDate, { ignoreBefore })
      anySuccess = true
      for (const row of states) {
        const endTime = addMinutes(row.time, opts.sessionDurationMinutes)
        slotVerdicts.push({
          courtKey: court.id,
          startTime: row.time,
          endTime,
          verdict: row.verdict,
          source: 'alovarzesh',
        })
        if (row.verdict === 'BUSY') {
          occupied.push({
            courtKey: court.id,
            startTime: row.time,
            endTime,
            source: 'alovarzesh',
            state: 'EXTERNAL_BUSY',
          })
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `product ${productId} failed`)
      // PARTIAL: failed court must be UNKNOWN (not absent) so lone AloPlay BUSY cannot confirm.
      const open = court.effectiveOpenHour ?? 7
      const close = court.effectiveCloseHour ?? 23
      const starts = buildSessionStarts(open, close, opts.sessionDurationMinutes)
      for (const startTime of starts) {
        slotVerdicts.push({
          courtKey: court.id,
          startTime,
          endTime: addMinutes(startTime, opts.sessionDurationMinutes),
          verdict: 'UNKNOWN',
          source: 'alovarzesh',
        })
      }
    }
  }

  // Total failure: empty occupied + error + OFFLINE; do not write cache (no stale busy paint).
  if (!anySuccess && errors.length) {
    return {
      source: 'alovarzesh',
      occupied: [],
      supported: true,
      error: errors.join('; '),
      completeness: 'UNKNOWN',
      health: 'OFFLINE',
      slotVerdicts: [],
      anomalies: ['fetch_failed'],
    }
  }

  const completeness = errors.length && anySuccess ? 'PARTIAL' : (anySuccess ? 'COMPLETE' : 'UNKNOWN')
  const health = errors.length
    ? (anySuccess ? 'DEGRADED' : 'SUSPICIOUS')
    : 'HEALTHY'

  await writeCached(cacheKey, { occupied, slotVerdicts })
  return {
    source: 'alovarzesh',
    occupied,
    supported: true,
    error: errors.length ? errors.join('; ') : undefined,
    completeness,
    health,
    slotVerdicts,
    anomalies: errors.length ? ['partial_court_fetch'] : undefined,
  }
}
