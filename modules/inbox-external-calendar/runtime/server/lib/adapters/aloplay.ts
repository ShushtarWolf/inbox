import {
  isTruncatedAloPlayFreeSet,
  parseAvailableTimePayload,
  suspectedOccupiedFromFreeSet,
  unionFreeSlots,
} from '../../../../lib/aloplayParse'
import { resolveAloPlayCredentials } from '../../../../lib/aloplaySession'
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

/** Fail closed: clear AloPlay paint (and let persist wipe snapshots). Rate-limit keeps last good via error. */
function wipeAloPlay(): { occupied: ExternalOccupiedSlot[] } {
  return { occupied: [] }
}

async function fetchAvailableTimePayload(opts: {
  clubId: number
  date: string
  productGender: number
}): Promise<{ payload: unknown | null; error?: string; usedAuth: boolean }> {
  const cacheKey = `ext-cal:aloplay-available:${opts.clubId}:${opts.date}:g${opts.productGender}:authed-v3`
  const cached = await readCached<unknown>(cacheKey)
  if (cached) return { payload: cached, usedAuth: true }

  // Occupancy never uses the public stub — only a logged-in GetAvailableTime.
  const result = await fetchAloPlayWithSession(
    'v1/PublicClub/GetAvailableTime',
    {
      clubId: opts.clubId,
      date: opts.date,
      productGender: opts.productGender,
    },
    { requireAuth: true },
  )

  if (result.error && result.payload == null) {
    return { payload: null, error: result.error, usedAuth: Boolean(result.usedAuth) }
  }
  if (!result.usedAuth) {
    return {
      payload: null,
      error: 'GetAvailableTime must use AloPlay session',
      usedAuth: false,
    }
  }

  if (result.payload != null) {
    await writeCached(cacheKey, result.payload)
  }
  return { payload: result.payload, error: result.error, usedAuth: true }
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

  if (!resolveAloPlayCredentials()) {
    // Misconfigured env: do not paint from public stub; wipe any poison.
    return wipeAloPlay()
  }

  const cacheKey = `ext-cal:aloplay:${clubId}:${opts.date}:v3`
  const cached = await readCached<ExternalOccupiedSlot[]>(cacheKey)
  if (cached) return { occupied: cached }

  const limit = checkAdapterRateLimit(`aloplay:${clubId}`)
  if (!limit.allowed) {
    // Keep last snapshots on rate limit only.
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
  let anyAuth = false

  for (const productGender of genders) {
    const { payload, error, usedAuth } = await fetchAvailableTimePayload({
      clubId,
      date: opts.date,
      productGender,
    })
    if (usedAuth) anyAuth = true
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

  if (!anyAuth) {
    return wipeAloPlay()
  }

  const successfulParses = parseResults.filter((result) => !result.error)
  if (!successfulParses.length) {
    // Auth path failed to parse — wipe rather than keep poison snapshots.
    return wipeAloPlay()
  }

  const freeSlots = unionFreeSlots(successfulParses)
  // Empty or stub free-set would paint the whole day occupied — refuse and wipe.
  if (freeSlots.size === 0 || isTruncatedAloPlayFreeSet(freeSlots)) {
    return wipeAloPlay()
  }

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
