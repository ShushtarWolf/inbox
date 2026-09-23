export type BlockConflictReason = 'OCCUPIED' | 'PAST' | 'OUTSIDE_HOURS' | 'CLAIM_RACE' | 'MISSING'

export type BlockSlotRef = {
  date: string
  startTime: string
  courtId?: string
  slotId?: string
}

export type BlockConflictRef = BlockSlotRef & {
  reason: BlockConflictReason
}

/**
 * Whether owner block may claim/update this slot (mirrors /api/owner/block rules).
 * FREE always; BLOCKED only when no live booking or CLUB-sourced booking.
 */
export function classifyBlockCandidate(opts: {
  displayStatus?: string | null
  bookingSource?: string | null
  bookingStatus?: string | null
}): 'BLOCKABLE' | 'OCCUPIED' {
  const status = opts.displayStatus || 'FREE'
  if (status === 'FREE') return 'BLOCKABLE'
  if (status === 'BLOCKED') {
    const live = Boolean(opts.bookingStatus && opts.bookingStatus !== 'CANCELLED')
    if (!live) return 'BLOCKABLE'
    if (opts.bookingSource === 'CLUB') return 'BLOCKABLE'
    return 'OCCUPIED'
  }
  return 'OCCUPIED'
}
