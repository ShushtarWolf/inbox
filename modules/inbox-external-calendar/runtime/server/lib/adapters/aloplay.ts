import {
  aloPlayHourVerdicts,
  assessAloPlayCompleteness,
  confirmedBusyFromFreeSet,
  parseAvailableTimePayload,
  unionFreeSlots,
} from '../../../../lib/aloplayParse'
import { resolveAloPlayCredentials } from '../../../../lib/aloplaySession'
import type {
  AdapterSlotVerdict,
  Completeness,
  ExternalAdapterResult,
  ExternalOccupiedSlot,
  SourceHealth,
} from '../types'
import { readCached, writeCached } from '../cache'
import { findCourtMapping } from '../courtMatch'
import { fetchAloPlayWithSession } from '../aloplaySessionStore'
import { checkAdapterRateLimit } from '../rateLimit'
import { addMinutes, buildSessionStarts } from '../time'

const DEFAULT_GENDERS = [1, 2] as const

function resolveAloPlayGenders(mapping: Parameters<typeof fetchAloPlayOccupied>[0]['mapping']): number[] {
  const aloplay = mapping.sources?.aloplay
  const genders = (aloplay as { genders?: number[] } | undefined)?.genders
  if (genders?.length) return genders
  if (aloplay?.productGender != null) return [aloplay.productGender]
  return [...DEFAULT_GENDERS]
}

function wipeAloPlay(opts?: {
  error?: string
  health?: SourceHealth
  completeness?: Completeness
  anomalies?: string[]
  slotVerdicts?: AdapterSlotVerdict[]
}): ExternalAdapterResult {
  return {
    source: 'aloplay',
    occupied: [],
    supported: true,
    error: opts?.error,
    completeness: opts?.completeness ?? 'UNKNOWN',
    health: opts?.health ?? 'SUSPICIOUS',
    slotVerdicts: opts?.slotVerdicts ?? [],
    anomalies: opts?.anomalies,
  }
}

async function fetchAvailableTimePayload(opts: {
  clubId: number
  date: string
  productGender: number
}): Promise<{ payload: unknown | null; error?: string; usedAuth: boolean }> {
  // Bump cache keys so prior poisoned busy paints are ignored.
  const cacheKey = `ext-cal:aloplay-available:${opts.clubId}:${opts.date}:g${opts.productGender}:authed-v4`
  const cached = await readCached<unknown>(cacheKey)
  if (cached) return { payload: cached, usedAuth: true }

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
  mapping: import('../types').ClubMapping
  date: string
  courts: Array<{
    id: string
    nameFa: string
    effectiveOpenHour: number
    effectiveCloseHour: number
  }>
  sessionDurationMinutes: number
}): Promise<ExternalAdapterResult> {
  const clubId = opts.mapping.sources?.aloplay?.clubId
  if (clubId == null) {
    return {
      source: 'aloplay',
      occupied: [],
      supported: false,
      error: 'AloPlay clubId is not mapped yet (TODO).',
      completeness: 'UNKNOWN',
      health: 'OFFLINE',
      slotVerdicts: [],
    }
  }

  if (!resolveAloPlayCredentials()) {
    return wipeAloPlay({
      error: 'AloPlay credentials missing',
      health: 'OFFLINE',
      completeness: 'UNKNOWN',
      anomalies: ['no_auth'],
    })
  }

  const cacheKey = `ext-cal:aloplay:${clubId}:${opts.date}:v4`
  const cached = await readCached<{
    occupied: ExternalOccupiedSlot[]
    slotVerdicts: AdapterSlotVerdict[]
    completeness: Completeness
  }>(cacheKey)
  if (cached?.occupied && cached.slotVerdicts) {
    return {
      source: 'aloplay',
      occupied: cached.occupied,
      supported: true,
      completeness: cached.completeness ?? 'COMPLETE',
      health: 'HEALTHY',
      slotVerdicts: cached.slotVerdicts,
    }
  }

  const limit = checkAdapterRateLimit(`aloplay:${clubId}`)
  if (!limit.allowed) {
    return {
      source: 'aloplay',
      occupied: [],
      supported: true,
      error: 'AloPlay rate limited — retry shortly.',
      completeness: 'UNKNOWN',
      health: 'DEGRADED',
      slotVerdicts: [],
      anomalies: ['rate_limited'],
    }
  }

  type Mapped = { courtKey: string; productId: number; starts: string[] }
  const mappedCourts: Mapped[] = []
  const unmappedStarts: Array<{ courtKey: string; starts: string[] }> = []

  for (const court of opts.courts) {
    const mappingCourt = findCourtMapping(opts.mapping, court)
    const aloplay = mappingCourt?.external?.aloplay
    const productId = aloplay?.productId ?? aloplay?.courtId
    const starts = buildSessionStarts(
      court.effectiveOpenHour,
      court.effectiveCloseHour,
      opts.sessionDurationMinutes,
    )
    if (productId == null) {
      unmappedStarts.push({ courtKey: court.id, starts })
      continue
    }
    mappedCourts.push({ courtKey: court.id, productId, starts })
  }

  if (!mappedCourts.length) {
    const slotVerdicts: AdapterSlotVerdict[] = unmappedStarts.flatMap(({ courtKey, starts }) =>
      starts.map((startTime) => ({
        courtKey,
        startTime,
        endTime: addMinutes(startTime, opts.sessionDurationMinutes),
        verdict: 'UNKNOWN' as const,
        source: 'aloplay' as const,
      })),
    )
    return wipeAloPlay({
      error: 'AloPlay productId is not mapped for any court (TODO).',
      health: 'SUSPICIOUS',
      completeness: 'UNKNOWN',
      anomalies: ['mapping_missing'],
      slotVerdicts,
    })
  }

  const genders = resolveAloPlayGenders(opts.mapping)
  const parseResults: Array<{ freeSlots: Set<string>; error?: string }> = []
  const fetchErrors: string[] = []
  let anyAuth = false
  let genderSuccesses = 0

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
    const parsed = parseAvailableTimePayload(payload)
    parseResults.push(parsed)
    if (!parsed.error) genderSuccesses += 1
  }

  if (!anyAuth) {
    return wipeAloPlay({
      error: 'GetAvailableTime must use AloPlay session',
      health: 'OFFLINE',
      completeness: 'UNKNOWN',
      anomalies: ['no_auth'],
    })
  }

  const successfulParses = parseResults.filter((result) => !result.error)
  if (!successfulParses.length) {
    return wipeAloPlay({
      error: fetchErrors.join('; ') || 'AloPlay parse failed',
      health: 'SUSPICIOUS',
      completeness: 'UNKNOWN',
      anomalies: ['malformed_or_empty'],
    })
  }

  const freeSlots = unionFreeSlots(successfulParses)
  const mappedProductIds = mappedCourts.map((c) => c.productId)
  let completeness: Completeness = assessAloPlayCompleteness({
    freeSlots,
    mappedProductIds,
  })

  // One gender succeeds and another fails → PARTIAL (missing must not become BUSY).
  if (completeness === 'COMPLETE' && fetchErrors.length > 0 && genderSuccesses > 0) {
    completeness = 'PARTIAL'
  }

  if (completeness === 'UNKNOWN' && freeSlots.size === 0) {
    return wipeAloPlay({
      error: 'GetAvailableTime returned no free slots — refusing to mark entire day occupied',
      health: 'SUSPICIOUS',
      completeness: 'UNKNOWN',
      anomalies: ['empty_free_set'],
    })
  }

  const hourVerdicts = aloPlayHourVerdicts(mappedCourts, freeSlots, completeness)
  const slotVerdicts: AdapterSlotVerdict[] = [
    ...hourVerdicts.map((row) => ({
      courtKey: row.courtKey,
      startTime: row.startTime,
      endTime: addMinutes(row.startTime, opts.sessionDurationMinutes),
      verdict: row.verdict,
      source: 'aloplay' as const,
    })),
    ...unmappedStarts.flatMap(({ courtKey, starts }) =>
      starts.map((startTime) => ({
        courtKey,
        startTime,
        endTime: addMinutes(startTime, opts.sessionDurationMinutes),
        verdict: 'UNKNOWN' as const,
        source: 'aloplay' as const,
      })),
    ),
  ]

  // Never call suspectedOccupiedFromFreeSet unless COMPLETE.
  const busyRows = confirmedBusyFromFreeSet(mappedCourts, freeSlots, completeness)
  const occupied: ExternalOccupiedSlot[] = busyRows.map(({ courtKey, startTime }) => ({
    courtKey,
    startTime,
    endTime: addMinutes(startTime, opts.sessionDurationMinutes),
    source: 'aloplay',
    state: 'EXTERNAL_BUSY',
  }))

  await writeCached(cacheKey, { occupied, slotVerdicts, completeness })

  const health: SourceHealth = fetchErrors.length
    ? (completeness === 'PARTIAL' ? 'DEGRADED' : 'SUSPICIOUS')
    : 'HEALTHY'

  return {
    source: 'aloplay',
    occupied,
    supported: true,
    error: fetchErrors.length ? fetchErrors.join('; ') : undefined,
    completeness,
    health,
    slotVerdicts,
    anomalies: fetchErrors.length ? ['partial_gender_fetch'] : undefined,
  }
}
