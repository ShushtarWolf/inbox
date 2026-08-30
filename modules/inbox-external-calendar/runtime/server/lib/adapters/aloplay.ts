import {
  parseAvailableTimePayload,
  suspectedOccupiedFromFreeSet,
  unionFreeSlots,
} from '../../../../lib/aloplayParse'
import { needsAloPlaySession } from '../../../../lib/aloplaySession'
import type { ClubMapping, ExternalOccupiedSlot } from '../types'
import { readCached, writeCached } from '../cache'
import { findCourtMapping } from '../courtMatch'
import { fetchAloPlayWithSession } from '../aloplaySessionStore'
import { checkAdapterRateLimit } from '../rateLimit'
import { addMinutes, buildSessionStarts } from '../time'

const DEFAULT_GENDERS = [1, 2] as const

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
}): Promise<{ payload: unknown | null; error?: string }> {
  const cacheKey = `ext-cal:aloplay-available:${opts.clubId}:${opts.date}:g${opts.productGender}`
  const cached = await readCached<unknown>(cacheKey)
  if (cached) return { payload: cached }

  const requireAuth = needsAloPlaySession(opts.date)
  const result = await fetchAloPlayWithSession(
    'v1/PublicClub/GetAvailableTime',
    {
      clubId: opts.clubId,
      date: opts.date,
      productGender: opts.productGender,
    },
    { requireAuth },
  )

  if (result.error && result.payload == null) {
    return { payload: null, error: result.error }
  }

  if (result.payload != null) {
    await writeCached(cacheKey, result.payload)
  }
  return { payload: result.payload, error: result.error }
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
    const { payload, error } = await fetchAvailableTimePayload({
      clubId,
      date: opts.date,
      productGender,
    })
    if (error && payload == null) {
      fetchErrors.push(error)
      continue
    }
    if (payload == null) {
      fetchErrors.push(`GetAvailableTime gender ${productGender} returned empty body`)
      continue
    }
    parseResults.push(parseAvailableTimePayload(payload))
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
