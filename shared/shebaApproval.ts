/** Whether an approved live SHEBA is present for bank withdraw. */
export function hasApprovedPayoutSheba(sheba: string | null | undefined): boolean {
  return Boolean(sheba?.trim())
}

/** True when a new proposed value differs from the currently approved live SHEBA. */
export function shebaChangeNeeded(
  currentApproved: string | null | undefined,
  proposed: string | null | undefined,
): boolean {
  const cur = currentApproved?.trim() || null
  const next = proposed?.trim() || null
  return cur !== next
}

export type ShebaRequestUiStatus = 'none' | 'pending' | 'rejected' | 'active'

/** Owner/athlete finance UI state for SHEBA approval flow. */
export function resolveShebaRequestUiStatus(options: {
  approvedSheba: string | null | undefined
  pendingRequest?: { proposedSheba: string | null } | null
  lastRejected?: { adminNote?: string | null } | null
}): ShebaRequestUiStatus {
  if (options.pendingRequest) return 'pending'
  if (options.lastRejected && !hasApprovedPayoutSheba(options.approvedSheba)) return 'rejected'
  if (hasApprovedPayoutSheba(options.approvedSheba)) return 'active'
  if (options.lastRejected) return 'rejected'
  return 'none'
}
