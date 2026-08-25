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

/** Athlete-facing: inbox FREE + external occupied — no platform identifiers. */
export function computeSuspectedSlots(
  inboxSlots: InboxSlotWithId[],
  externalSlots: ExternalOccupiedSlot[],
): PublicSuspectedSlot[] {
  const externalKeys = new Set(
    externalSlots.map((slot) => occupancyKey(slot.courtKey, slot.startTime)),
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
