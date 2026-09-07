import { isInboxOccupied } from './merge'
import type { ExternalOccupiedSlot, InboxCalendarSlot } from './types'

export interface PublicSuspectedSlot {
  slotId?: string
  startTime: string
  courtId: string
  suspected: true
}

export type InboxSlotWithId = InboxCalendarSlot & { id?: string }

function occupancyKey(courtId: string, startTime: string) {
  return `${courtId}:${startTime.slice(0, 5)}`
}

/**
 * Athlete-facing: inbox FREE + external confirmed EXTERNAL_BUSY — no platform identifiers.
 *
 * INVARIANT: `externalSlots` must already be reconciled confirmed EXTERNAL_BUSY only.
 * UNKNOWN / STALE / CONFLICT / PARTIAL must never appear here or yellow-paint athletes.
 */
export function computeSuspectedSlots(
  inboxSlots: InboxSlotWithId[],
  externalSlots: ExternalOccupiedSlot[],
): PublicSuspectedSlot[] {
  const confirmed = externalSlots.filter((slot) => !slot.state || slot.state === 'EXTERNAL_BUSY')
  const externalKeys = new Set(
    confirmed.map((slot) => occupancyKey(slot.courtKey, slot.startTime)),
  )
  const suspected: PublicSuspectedSlot[] = []

  for (const slot of inboxSlots) {
    if (isInboxOccupied(slot.displayStatus)) continue
    const key = occupancyKey(slot.courtId, slot.startTime)
    if (!externalKeys.has(key)) continue
    suspected.push({
      slotId: slot.id,
      startTime: slot.startTime.slice(0, 5),
      courtId: slot.courtId,
      suspected: true,
    })
  }

  return suspected
}

/** Same as computeSuspectedSlots — explicit name for call sites that pass state-bearing rows. */
export function computeSuspectedSlotsFromStates(
  inboxSlots: InboxSlotWithId[],
  externalSlots: ExternalOccupiedSlot[],
): PublicSuspectedSlot[] {
  return computeSuspectedSlots(inboxSlots, externalSlots)
}
