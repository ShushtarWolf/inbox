import type { ClubMapping, ExternalOccupiedSlot } from '../types'
import { readCached, writeCached } from '../cache'
import { findCourtMapping } from '../courtMatch'
import { checkAdapterRateLimit } from '../rateLimit'
import { addMinutes, buildSessionStarts, normalizeClockTime } from '../time'

const ALOPLAY_BASE = 'https://ws.aloplay.io/api'

function collectAvailableTimes(payload: unknown): string[] {
  const found = new Set<string>()

  const visit = (node: unknown) => {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (typeof node !== 'object') return

    const record = node as Record<string, unknown>
    for (const key of ['time', 'startTime', 'StartTime', 'fromTime', 'value']) {
      const normalized = normalizeClockTime(record[key])
      if (normalized) found.add(normalized)
    }
    for (const value of Object.values(record)) visit(value)
  }

  visit(payload)
  return [...found].sort()
}

async function fetchAloPlayJson(path: string, query: Record<string, string | number>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    params.set(key, String(value))
  }
  const url = `${ALOPLAY_BASE}/${path}?${params.toString()}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: 'https://aloplay.io',
      Referer: 'https://aloplay.io/',
    },
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    throw new Error(`AloPlay ${path} HTTP ${response.status}`)
  }
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export async function fetchAloPlayOccupied(opts: {
  mapping: ClubMapping
  date: string
  courts: Array<{
    id: string
    nameFa: string
    effectiveOpenHour: number
    effectiveCloseHour: number
  }>
  sessionDurationMinutes: number
}): Promise<{ occupied: ExternalOccupiedSlot[]; error?: string }> {
  const clubId = opts.mapping.sources?.aloplay?.clubId
  if (clubId == null) {
    return { occupied: [], error: 'AloPlay clubId is not mapped yet (TODO).' }
  }

  const productGender = opts.mapping.sources?.aloplay?.productGender ?? 2
  const cacheKey = `ext-cal:aloplay:${clubId}:${opts.date}:g${productGender}`
  const cached = await readCached<ExternalOccupiedSlot[]>(cacheKey)
  if (cached) return { occupied: cached }

  const limit = checkAdapterRateLimit(`aloplay:${clubId}`)
  if (!limit.allowed) {
    return { occupied: [], error: 'AloPlay rate limited — retry shortly.' }
  }

  let availableTimes: string[] = []
  try {
    const payload = await fetchAloPlayJson('v1/PublicClub/GetAvailableTime', {
      clubId,
      date: opts.date,
      productGender,
    })
    availableTimes = collectAvailableTimes(payload)
  } catch (error) {
    return {
      occupied: [],
      error: error instanceof Error ? error.message : 'AloPlay GetAvailableTime failed',
    }
  }

  if (!availableTimes.length) {
    return { occupied: [], error: 'AloPlay returned no parsable availability (read-only overlay skipped).' }
  }

  const availableSet = new Set(availableTimes)
  const occupied: ExternalOccupiedSlot[] = []

  for (const court of opts.courts) {
    const mappingCourt = findCourtMapping(opts.mapping, court)
    if (!mappingCourt?.external?.aloplay) continue

    const starts = buildSessionStarts(
      court.effectiveOpenHour,
      court.effectiveCloseHour,
      opts.sessionDurationMinutes,
    )

    for (const startTime of starts) {
      if (availableSet.has(startTime)) continue

      try {
        const byTime = await fetchAloPlayJson('v1/Product/GetByTime', {
          clubId,
          date: opts.date,
          time: startTime,
          productGender,
        })
        const stillAvailable = collectAvailableTimes(byTime)
        if (stillAvailable.includes(startTime)) continue
      } catch {
        // Keep inverse-of-GetAvailableTime when GetByTime is unavailable.
      }

      occupied.push({
        courtKey: court.id,
        startTime,
        endTime: addMinutes(startTime, opts.sessionDurationMinutes),
        source: 'aloplay',
      })
    }
  }

  await writeCached(cacheKey, occupied)
  return { occupied }
}
