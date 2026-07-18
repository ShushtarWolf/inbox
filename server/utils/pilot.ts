import type { H3Event } from 'h3'
import { isPilotNoCoach } from '../../shared/pilot'

function runtimePilotNoCoach(event?: H3Event): boolean {
  if (!event) return false
  try {
    return Boolean(useRuntimeConfig(event).public.pilotNoCoach)
  } catch {
    return false
  }
}

/** True when coach product is off (env and/or baked public runtimeConfig). */
export function isCoachProductDisabled(event?: H3Event) {
  return isPilotNoCoach() || runtimePilotNoCoach(event)
}

export function assertCoachProductEnabled(event?: H3Event) {
  if (!isCoachProductDisabled(event)) return
  throw createError({
    statusCode: 404,
    statusMessage: 'Coach product is disabled in pilot mode',
  })
}

export function coachProductEnabled(event?: H3Event) {
  return !isCoachProductDisabled(event)
}
