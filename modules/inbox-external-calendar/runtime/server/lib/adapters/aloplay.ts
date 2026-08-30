import {
  parseAvailableTimePayload,
  suspectedOccupiedFromFreeSet,
  unionFreeSlots,
} from '../../../../lib/aloplayParse'
import type { ClubMapping, ExternalOccupiedSlot } from '../types'
import { readCached, writeCached } from '../cache'
import { findCourtMapping } from '../courtMatch'
import { checkAdapterRateLimit } from '../rateLimit'
import { addMinutes, buildSessionStarts } from '../time'

const ALOPLAY_BASE = 'https://ws.aloplay.io/api'
const DEFAULT_GENDERS = [1, 2] as const

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

function resolveAloPlayGenders(mapping: ClubMapping): number[] {
  const aloplay = mapping.sources?.aloplay
  const genders = (aloplay as { genders?: number[] } | undefined)?.genders
  if (genders?.length) return genders
  if (aloplay?.productGender != null) return [aloplay.productGender]
  return [...DEFAULT_GENDERS]
}

async function fetchAvailableTimePayload(opts: {
  clubId: number
  date: string
  productGender: number
}): Promise<unknown | null> {
  const cacheKey = `ext-cal:aloplay-available:${opts.clubId}:${opts.date}:g${opts.productGender}`
  const cached = await readCached<unknown>(cacheKey)
  if (cached) return cached

  const payload = await fetchAloPlayJson('v1/PublicClub/GetAvailableTime', {
    clubId: opts.clubId,
    date: opts.date,
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
      const aloplay = mappingCourt?.external?.aloplay
      const productId = aloplay?.productId ?? aloplay?.courtId
      if (productId == null) return null
      return {
        courtKey: court.id,
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

  const genders = resolveAloPlayGenders(opts.mapping)
  const parseResults: Array<{ freeSlots: Set<string>; error?: string }> = []
  const fetchErrors: string[] = []

  for (const productGender of genders) {
    try {
      const payload = await fetchAvailableTimePayload({
        clubId,
        date: opts.date,
        productGender,
      })
      if (payload == null) {
        fetchErrors.push(`GetAvailableTime gender ${productGender} returned empty body`)
        continue
      }
      parseResults.push(parseAvailableTimePayload(payload))
    } catch (error) {
      fetchErrors.push(
        error instanceof Error
          ? error.message
          : `GetAvailableTime gender ${productGender} failed`,
      )
    }
  }

  const successfulParses = parseResults.filter((result) => !result.error)
  if (!successfulParses.length) {
    const errors = [
      ...fetchErrors,
      ...parseResults.map((result) => result.error).filter((message): message is string => Boolean(message)),
    ]
    return {
      occupied: [],
      error: errors.join('; ') || 'GetAvailableTime failed for all genders',
    }
  }

  const freeSlots = unionFreeSlots(successfulParses)
  const suspected = suspectedOccupiedFromFreeSet(mappedCourts, freeSlots)
  const occupied: ExternalOccupiedSlot[] = suspected.map(({ courtKey, startTime }) => ({
    courtKey,
    startTime,
    endTime: addMinutes(startTime, opts.sessionDurationMinutes),
    source: 'aloplay',
  }))

  await writeCached(cacheKey, occupied)
  return {
    occupied,
    error: fetchErrors.length ? fetchErrors.join('; ') : undefined,
  }
}
