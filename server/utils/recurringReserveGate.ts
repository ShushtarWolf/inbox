import type { H3Event } from 'h3'
import { isRecurringReserveEnabled, type RecurringReserveGateOptions } from '#shared/recurringReserve.ts'

function mergeGateOptions(event?: H3Event): RecurringReserveGateOptions | undefined {
  if (!event) return undefined
  try {
    const runtime = useRuntimeConfig(event).public as { recurringReserveEnabled?: boolean }
    return { enabled: isRecurringReserveEnabled() || Boolean(runtime?.recurringReserveEnabled) }
  } catch {
    return undefined
  }
}

export function assertRecurringReserveEnabled(event?: H3Event) {
  if (!isRecurringReserveEnabled(mergeGateOptions(event))) {
    throw createError({
      statusCode: 403,
      statusMessage: 'RECURRING_RESERVE_DISABLED',
    })
  }
}

export function recurringReserveEnabledForEvent(event?: H3Event): boolean {
  return isRecurringReserveEnabled(mergeGateOptions(event))
}
