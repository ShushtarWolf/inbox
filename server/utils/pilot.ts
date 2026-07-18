import type { H3Event } from 'h3'
import { isPilotNoCoach } from '../../shared/pilot'

export function assertCoachProductEnabled(event?: H3Event) {
  void event
  if (!isPilotNoCoach()) return
  throw createError({
    statusCode: 404,
    statusMessage: 'Coach product is disabled in pilot mode',
  })
}

export function coachProductEnabled() {
  return !isPilotNoCoach()
}
