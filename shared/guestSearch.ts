import { formatGuestDisplayName, normalizeGuestNamePair } from './guestName.ts'
import { splitStoredFullName } from './userName.ts'

export type GuestSearchSource = 'user' | 'contact' | 'booking'

export type GuestSearchHit = {
  /** Full label for dropdown rows */
  name: string
  guestName: string
  guestFamily: string
  mobile: string
  source: GuestSearchSource
}

export function buildGuestSearchHit(opts: {
  guestName: string
  guestFamily: string
  mobile: string
  source: GuestSearchSource
}): GuestSearchHit {
  const guestName = opts.guestName.trim()
  const guestFamily = opts.guestFamily.trim()
  const name = formatGuestDisplayName(guestName, guestFamily) || guestName || guestFamily
  return {
    name,
    guestName,
    guestFamily,
    mobile: opts.mobile.trim(),
    source: opts.source,
  }
}

/** Map autocomplete selection → desk form first + family fields. */
export function guestSearchHitToFormPair(hit: GuestSearchHit): { guestName: string; guestFamily: string } {
  let { guestName, guestFamily } = normalizeGuestNamePair(hit.guestName, hit.guestFamily)
  if (!guestName && !guestFamily && hit.name.trim()) {
    const split = splitStoredFullName(hit.name)
    guestName = split.name
    guestFamily = split.nameFamily
  }
  else if (guestName && !guestFamily && guestName.includes(' ')) {
    const split = splitStoredFullName(guestName)
    guestName = split.name
    guestFamily = split.nameFamily
  }
  return { guestName, guestFamily }
}
