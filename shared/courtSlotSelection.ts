import { formatGuestDisplayName } from './guestName.ts'
import { normalizeIranPhone } from './phone.ts'

/** Multi-court / multi-hour slot basket helpers (same club + same date). */

export type SelectableCourtSlot = {
  id: string
  startTime: string
  displayStatus?: string | null
  courtId?: string | null
  court?: { id?: string | null } | null
}

export type BookedSlotGuest = {
  status?: string | null
  guestMobile?: string | null
  guestName?: string | null
  guestFamily?: string | null
}

const BOOKED_CANCEL_STATUSES = new Set(['RESERVED', 'PENDING'])

export function slotCourtId(slot: {
  courtId?: string | null
  court?: { id?: string | null } | null
}): string {
  return slot.courtId || slot.court?.id || ''
}

export function isSlotFree(slot: { displayStatus?: string | null }): boolean {
  return !slot.displayStatus || slot.displayStatus === 'FREE'
}

export type DeskReserveSelectionIssue = 'past' | 'unavailable'

/** Why a desk selection cannot start a new reserve (block can still apply to past FREE). */
export function deskReserveSelectionIssue<T extends { displayStatus?: string | null }>(
  slots: T[],
  slotIsInPast: (slot: T) => boolean,
): DeskReserveSelectionIssue | null {
  if (!slots.length) return null
  if (slots.some(slotIsInPast)) return 'past'
  if (slots.some((slot) => !isSlotFree(slot))) return 'unavailable'
  return null
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

export function uniqueOrdered<T>(items: T[]): T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const item of items) {
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}

/** Persian-style list: «الف و ب» / «الف، ب و پ». */
export function joinWithAnd(items: string[], andWord = 'و'): string {
  const clean = items.map((item) => item.trim()).filter(Boolean)
  if (!clean.length) return ''
  if (clean.length === 1) return clean[0]!
  if (clean.length === 2) return `${clean[0]} ${andWord} ${clean[1]}`
  return `${clean.slice(0, -1).join('، ')} ${andWord} ${clean[clean.length - 1]}`
}

export function clockTime(value: string): string {
  return String(value || '').slice(0, 5)
}

export function sortSlotsByTimeThenCourt<T extends {
  startTime: string
  courtId?: string | null
  court?: { id?: string | null } | null
}>(slots: T[], courtOrder: string[] = []): T[] {
  const indexOf = (slot: T) => {
    const id = slotCourtId(slot)
    const idx = courtOrder.indexOf(id)
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx
  }
  return [...slots].sort((a, b) => {
    const time = clockTime(a.startTime).localeCompare(clockTime(b.startTime))
    if (time) return time
    return indexOf(a) - indexOf(b)
  })
}

/**
 * Toggle one clock hour onto every selected court that has a FREE slot then.
 * Booked courts are skipped (the pick does not fail). Same-court multi-hour is
 * unchanged: a single selected court toggles only that court's slot.
 */
export function toggleHourOnCourts(opts: {
  selectedSlotIds: string[]
  selectedCourtIds: string[]
  startTime: string
  slots: SelectableCourtSlot[]
}): string[] {
  const hour = clockTime(opts.startTime)
  const courtSet = new Set(opts.selectedCourtIds.filter(Boolean))
  if (!hour || !courtSet.size) return opts.selectedSlotIds

  const candidates = opts.slots.filter((slot) => {
    if (!isSlotFree(slot)) return false
    if (!courtSet.has(slotCourtId(slot))) return false
    return clockTime(slot.startTime) === hour
  })
  if (!candidates.length) return opts.selectedSlotIds

  const candidateIds = candidates.map((slot) => slot.id)
  const allOn = candidateIds.every((id) => opts.selectedSlotIds.includes(id))
  if (allOn) {
    return opts.selectedSlotIds.filter((id) => !candidateIds.includes(id))
  }
  const next = new Set(opts.selectedSlotIds)
  for (const id of candidateIds) next.add(id)
  return [...next]
}

export function courtIdsFromSlots(slots: SelectableCourtSlot[]): string[] {
  return uniqueOrdered(slots.map((slot) => slotCourtId(slot)).filter(Boolean))
}

export function timesFromSlots(slots: { startTime: string }[]): string[] {
  return uniqueOrdered(slots.map((slot) => clockTime(slot.startTime)).filter(Boolean))
}

/** Live RESERVED/PENDING booking that desk cancel may target (not FREE/BLOCKED/CLOSED). */
export function isCancellableBookedSlot(slot: {
  displayStatus?: string | null
  booking?: BookedSlotGuest | null
}): boolean {
  if (!BOOKED_CANCEL_STATUSES.has(String(slot.displayStatus || ''))) return false
  const booking = slot.booking
  if (!booking || booking.status === 'CANCELLED') return false
  return true
}

/**
 * Guest identity for grouping same-day hours: prefer mobile, else name+family.
 * Empty identity does not match other empty identities.
 */
export function bookedGuestKey(booking: BookedSlotGuest | null | undefined): string {
  if (!booking || booking.status === 'CANCELLED') return ''
  const mobileRaw = String(booking.guestMobile || '').trim()
  if (mobileRaw) {
    const normalized = normalizeIranPhone(mobileRaw)
    return `m:${normalized || mobileRaw}`
  }
  const name = formatGuestDisplayName(booking.guestName, booking.guestFamily)
  if (name) return `n:${name}`
  return ''
}

export type SiblingBookedSlot = {
  id: string
  date?: string | null
  startTime: string
  displayStatus?: string | null
  courtId?: string | null
  court?: { id?: string | null } | null
  booking?: BookedSlotGuest | null
}

/** Same calendar date + same guest, live RESERVED/PENDING hours (any court). */
export function siblingBookedSlots<T extends SiblingBookedSlot>(
  slots: T[],
  anchor: T,
  courtOrder: string[] = [],
): T[] {
  if (!isCancellableBookedSlot(anchor)) return []
  const date = anchor.date || ''
  const key = bookedGuestKey(anchor.booking)
  const matched = slots.filter((slot) => {
    if (slot.id === anchor.id) return true
    if (!key) return false
    if (!isCancellableBookedSlot(slot)) return false
    if ((slot.date || '') !== date) return false
    return bookedGuestKey(slot.booking) === key
  })
  return sortSlotsByTimeThenCourt(matched, courtOrder)
}

/** Checkbox toggle for booked cancel rows — never adds ids outside the sibling set. */
export function toggleBookedSlotSelection(
  selectedIds: string[],
  slotId: string,
  allowedIds: string[],
): string[] {
  if (!allowedIds.includes(slotId)) return selectedIds
  return toggleId(selectedIds, slotId)
}

/** Checked siblings that are still live bookings (the cancel target list). */
export function checkedBookedSlots<T extends { id: string; displayStatus?: string | null; booking?: BookedSlotGuest | null }>(
  siblings: T[],
  selectedIds: string[],
): T[] {
  const selected = new Set(selectedIds)
  return siblings.filter((slot) => selected.has(slot.id) && isCancellableBookedSlot(slot))
}
