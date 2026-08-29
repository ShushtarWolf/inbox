import { minutesUntilSlotStart } from './localDate.ts'

export type PackagesGateOptions = {
  env?: NodeJS.ProcessEnv
  /** Explicit override (e.g. Nuxt runtimeConfig.public.packagesEnabled). */
  enabled?: boolean
}

function resolvePackagesGate(options?: PackagesGateOptions) {
  const env = options?.env ?? process.env
  const enabled = options?.enabled ?? (
    env.NUXT_PUBLIC_PACKAGES_ENABLED === 'true' || env.PACKAGES_ENABLED === 'true'
  )
  return { enabled }
}

/** Class-package product gate (default off). Independent of recurring desk reserve. */
export function isPackagesEnabled(options?: PackagesGateOptions): boolean {
  return resolvePackagesGate(options).enabled
}

/** Active athlete seats that consume package capacity. */
export const ACTIVE_PACKAGE_BOOKING_STATUSES = ['PENDING', 'CONFIRMED'] as const
export type ActivePackageBookingStatus = (typeof ACTIVE_PACKAGE_BOOKING_STATUSES)[number]

/** Unpaid PENDING package bookings expire after this many minutes (mirrors competitions). */
export const PENDING_PACKAGE_BOOKING_EXPIRY_MINUTES = 10

export type PackageConflictKind = 'court_slot' | 'package_court' | 'package_coach' | 'coach_session'

export type PackageConflict = {
  kind: PackageConflictKind
  date: string
  startTime: string
  label?: string
  packageId?: string
  coachSessionId?: string
  slotId?: string
}

export type PackageSession = {
  date: string
  startTime: string
  endTime: string
}

/**
 * Cancel allowed when first session is still outside the club cancellation window.
 */
export function canCancelPackageBooking(
  firstSessionDate: string | null | undefined,
  firstSessionTime: string | null | undefined,
  cancellationWindowHours: number,
): boolean {
  if (!firstSessionDate) return true
  const time = firstSessionTime || '00:00'
  return minutesUntilSlotStart(firstSessionDate, time) >= cancellationWindowHours * 60
}
