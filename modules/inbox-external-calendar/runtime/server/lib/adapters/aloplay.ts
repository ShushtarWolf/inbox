import { unionOccupiedProductIds } from '../../../../lib/aloplayParse'
import type { ClubMapping, ExternalOccupiedSlot } from '../types'
import { readCached, writeCached } from '../cache'
import { findCourtMapping } from '../courtMatch'
import { checkAdapterRateLimit } from '../rateLimit'
import { addMinutes, buildSessionStarts } from '../time'

const ALOPLAY_BASE = 'https://ws.aloplay.io/api'
const ALOPLAY_GENDERS = [1, 2] as const

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

async function fetchByTimePayload(opts: {
  clubId: number
  date: string
  time: string
  productGender: number
}): Promise<unknown | null> {
  const cacheKey = `ext-cal:aloplay-bytimes:${opts.clubId}:${opts.date}:${opts.time}:g${opts.productGender}`
  const cached = await readCached<unknown>(cacheKey)
  if (cached) return cached

  const payload = await fetchAloPlayJson('v1/Product/GetByTime', {
    clubId: opts.clubId,
    date: opts.date,
    time: opts.time,
    productGender: opts.productGender,
  })
  if (payload != null) {
    await writeCached(cacheKey, payload)
  }
  return payload
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

  const mappedCourts = opts.courts
    .map((court) => {
      const mappingCourt = findCourtMapping(opts.mapping, court)
      const productId = mappingCourt?.external?.aloplay?.productId
      if (productId == null) return null
      return {
        court,
        productId,
        starts: buildSessionStarts(
          court.effectiveOpenHour,
          court.effectiveCloseHour,
          opts.sessionDurationMinutes,
        ),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)

  if (!mappedCourts.length) {
    return { occupied: [], error: 'AloPlay productId is not mapped for any court (TODO).' }
  }

  const sessionTimes = [...new Set(mappedCourts.flatMap((item) => item.starts))].sort()
  const occupiedByTime = new Map<string, Set<number>>()
  const errors: string[] = []

  for (const startTime of sessionTimes) {
    const payloads: unknown[] = []
    for (const productGender of ALOPLAY_GENDERS) {
      try {
        const payload = await fetchByTimePayload({
          clubId,
          date: opts.date,
          time: startTime,
          productGender,
        })
        if (payload != null) payloads.push(payload)
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : `GetByTime ${startTime} gender ${productGender} failed`,
        )
      }
    }

    if (!payloads.length) continue
    occupiedByTime.set(startTime, unionOccupiedProductIds(payloads))
  }

  const occupied: ExternalOccupiedSlot[] = []
  for (const { court, productId, starts } of mappedCourts) {
    for (const startTime of starts) {
      const occupiedProducts = occupiedByTime.get(startTime)
      if (!occupiedProducts?.has(productId)) continue

      occupied.push({
        courtKey: court.id,
        startTime,
        endTime: addMinutes(startTime, opts.sessionDurationMinutes),
        source: 'aloplay',
      })
    }
  }

  if (!occupied.length && errors.length && occupiedByTime.size === 0) {
    return { occupied: [], error: errors.join('; ') }
  }

  await writeCached(cacheKey, occupied)
  return {
    occupied,
    error: errors.length ? errors.join('; ') : undefined,
  }
}
