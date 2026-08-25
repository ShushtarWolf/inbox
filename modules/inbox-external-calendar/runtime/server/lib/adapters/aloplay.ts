import type { ClubMapping, ExternalOccupiedSlot } from '../types'
import { readCached, writeCached } from '../cache'
import { checkAdapterRateLimit } from '../rateLimit'

const ALOPLAY_BASE = 'https://ws.aloplay.io/api'

function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  return `${String(Number.parseInt(match[1], 10)).padStart(2, '0')}:${match[2]}`
}

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
    for (const key of ['time', 'startTime', 'StartTime', 'fromTime']) {
      const normalized = normalizeTime(record[key])
      if (normalized) found.add(normalized)
    }
    for (const value of Object.values(record)) visit(value)
  }

  visit(payload)
  return [...found].sort()
}

function buildSessionStarts(
  openHour: number,
  closeHour: number,
  durationMinutes: number,
): string[] {
  const times: string[] = []
  const openTotal = openHour * 60
  const closeTotal = closeHour * 60
  for (let minutes = openTotal; minutes + durationMinutes <= closeTotal; minutes += durationMinutes) {
    const hour = Math.floor(minutes / 60)
    const minute = minutes % 60
    times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
  }
  return times
}

async function fetchAloPlayJson(path: string, query: Record<string, string | number>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    params.set(key, String(value))
  }
  const url = `${ALOPLAY_BASE}/${path}?${params.toString()}`
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
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

  const cacheKey = `ext-cal:aloplay:${clubId}:${opts.date}`
  const cached = await readCached<ExternalOccupiedSlot[]>(cacheKey)
  if (cached) return { occupied: cached }

  const limit = checkAdapterRateLimit(`aloplay:${clubId}`)
  if (!limit.allowed) {
    return { occupied: [], error: 'AloPlay rate limited — retry shortly.' }
  }

  let availableTimes: string[] = []
  try {
    const payload = await fetchAloPlayJson('GetAvailableTime', { clubId, date: opts.date })
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
    const mappingCourt = opts.mapping.courts?.find((item) =>
      item.inboxCourtId === court.id
      || item.inboxCourtName === court.nameFa,
    )
    if (!mappingCourt?.external?.aloplay) continue

    const starts = buildSessionStarts(
      court.effectiveOpenHour,
      court.effectiveCloseHour,
      opts.sessionDurationMinutes,
    )

    for (const startTime of starts) {
      if (availableSet.has(startTime)) continue

      try {
        const byTime = await fetchAloPlayJson('GetByTime', {
          clubId,
          date: opts.date,
          time: startTime,
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
