export type RecurringReserveGateOptions = {
  env?: NodeJS.ProcessEnv
  /** Explicit override (e.g. Nuxt runtimeConfig.public.recurringReserveEnabled). */
  enabled?: boolean
}

/**
 * Desk season/package recurring reserve — overwrite-safe FREE-only claims.
 * Default OFF; opt in via RECURRING_RESERVE_ENABLED / NUXT_PUBLIC_ mirror,
 * or pass enabled from runtimeConfig on the client.
 */
export function isRecurringReserveEnabled(options?: RecurringReserveGateOptions): boolean {
  if (typeof options?.enabled === 'boolean') return options.enabled
  const env = options?.env ?? (typeof process !== 'undefined' ? process.env : undefined)
  if (!env) return false
  return (
    env.RECURRING_RESERVE_ENABLED === 'true'
    || env.NUXT_PUBLIC_RECURRING_RESERVE_ENABLED === 'true'
  )
}

export type RecurringConflictReason = 'OCCUPIED' | 'PAST' | 'OUTSIDE_HOURS' | 'CLAIM_RACE'

export type RecurringSlotRef = {
  date: string
  startTime: string
  courtId?: string
}

export type RecurringConflictRef = RecurringSlotRef & {
  reason: RecurringConflictReason
}

export type RecurringGenerateResult = {
  created: number
  skipped: number
  willCreate: RecurringSlotRef[]
  conflicts: RecurringConflictRef[]
}

/** Merge per-court season runs into one preview/confirm payload. */
export function mergeRecurringResults(parts: RecurringGenerateResult[]): RecurringGenerateResult {
  return {
    created: parts.reduce((sum, part) => sum + part.created, 0),
    skipped: parts.reduce((sum, part) => sum + part.skipped, 0),
    willCreate: parts.flatMap((part) => part.willCreate),
    conflicts: parts.flatMap((part) => part.conflicts),
  }
}

/**
 * Whether generateRecurringCourtSlots may claim this existing slot.
 * Only FREE slots without a live (non-cancelled) booking are safe.
 */
export function canClaimExistingSlotForRecurring(existing: {
  displayStatus: string
  booking?: { status: string } | null
} | null): boolean {
  if (!existing) return true
  if (existing.displayStatus !== 'FREE') return false
  if (existing.booking && existing.booking.status !== 'CANCELLED') return false
  return true
}

/** CREATED-event markers written by season / package-reserve / class-package / athlete-season flows. */
const RECURRING_EVENT_MARKERS = ['owner-recurring', 'class-package', 'athlete-season'] as const

/**
 * Owner calendar: season/package series or class-package court hold.
 * Uses packageDraftId and/or CREATED ReservationEvent metadata (no schema migration).
 */
export function isOwnerRecurringBooking(booking: {
  packageDraftId?: string | null
  isRecurring?: boolean | null
  events?: Array<{ metadataJson?: string | null }> | null
} | null | undefined): boolean {
  if (!booking) return false
  if (booking.isRecurring === true) return true
  if (booking.packageDraftId) return true
  return (booking.events || []).some((event) => {
    const meta = event.metadataJson || ''
    return RECURRING_EVENT_MARKERS.some((marker) => meta.includes(marker))
  })
}
