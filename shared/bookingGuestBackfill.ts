import { normalizeGuestNamePair } from './guestName.ts'
import { splitStoredFullName } from './userName.ts'

function trimPart(value: string | null | undefined): string {
  return String(value || '').trim()
}

export type BookingGuestBackfillRow = {
  guestName?: string | null
  guestFamily?: string | null
  user?: { name?: string | null; nameFamily?: string | null } | null
}

export type BookingGuestBackfillReason =
  | 'split_guest_name'
  | 'from_linked_user'
  | 'normalize_pair'

export type BookingGuestBackfillPlan = {
  guestName: string | null
  guestFamily: string | null
  reason: BookingGuestBackfillReason
}

/**
 * Propose guestName/guestFamily fixes when family was lost or never split.
 * Does not invent text — only splits existing guestName or copies linked User.nameFamily
 * when the stored first name matches the account.
 */
export function planBookingGuestFamilyBackfill(
  row: BookingGuestBackfillRow,
): BookingGuestBackfillPlan | null {
  const currentName = trimPart(row.guestName)
  const currentFamily = trimPart(row.guestFamily)

  if (currentFamily) {
    const norm = normalizeGuestNamePair(currentName, currentFamily)
    if (
      (norm.guestName !== currentName || norm.guestFamily !== currentFamily)
      && norm.guestFamily
    ) {
      return {
        guestName: norm.guestName || null,
        guestFamily: norm.guestFamily || null,
        reason: 'normalize_pair',
      }
    }
    return null
  }

  if (currentName.includes(' ')) {
    const split = splitStoredFullName(currentName)
    if (split.nameFamily) {
      return {
        guestName: split.name || null,
        guestFamily: split.nameFamily || null,
        reason: 'split_guest_name',
      }
    }
  }

  const userName = trimPart(row.user?.name)
  const userFamily = trimPart(row.user?.nameFamily)
  if (userFamily && (currentName === userName || !currentName)) {
    return {
      guestName: currentName || userName || null,
      guestFamily: userFamily,
      reason: 'from_linked_user',
    }
  }

  return null
}
