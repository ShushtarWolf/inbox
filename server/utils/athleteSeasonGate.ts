import type { H3Event } from 'h3'
import { isAthleteSeasonEnabled, type AthleteSeasonGateOptions } from '#shared/athleteSeason.ts'

function mergeGateOptions(event?: H3Event): AthleteSeasonGateOptions | undefined {
  if (!event) return undefined
  try {
    const runtime = useRuntimeConfig(event).public as { athleteSeasonEnabled?: boolean }
    return { enabled: isAthleteSeasonEnabled() || Boolean(runtime?.athleteSeasonEnabled) }
  }
  catch {
    return undefined
  }
}

export function assertAthleteSeasonEnabled(event?: H3Event) {
  if (!isAthleteSeasonEnabled(mergeGateOptions(event))) {
    throw createError({
      statusCode: 403,
      statusMessage: 'ATHLETE_SEASON_DISABLED',
    })
  }
}

export function athleteSeasonEnabledForEvent(event?: H3Event): boolean {
  return isAthleteSeasonEnabled(mergeGateOptions(event))
}
