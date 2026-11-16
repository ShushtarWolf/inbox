import { isSlotStartInPast } from './localDate.ts'

export type OwnerOverviewSlot = {
  displayStatus: string
  date?: string
  startTime: string
}

/** Forward-looking overview KPI: past free slots stay bookable but are not counted. */
export function countFutureFreeOverviewSlots(
  bookableSlots: OwnerOverviewSlot[],
  calendarDate: string,
  isExternalOnlyOccupied: (slot: OwnerOverviewSlot) => boolean,
  now = new Date(),
): number {
  return bookableSlots.filter(
    (slot) =>
      slot.displayStatus === 'FREE'
      && !isExternalOnlyOccupied(slot)
      && !isSlotStartInPast(slot.date || calendarDate, slot.startTime, now),
  ).length
}