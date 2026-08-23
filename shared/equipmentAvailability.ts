/** Normalize slot times to HH:MM for comparison. */
export function normalizeSlotTime(time: string): string {
  const trimmed = time.trim()
  const match = trimmed.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return trimmed
  return `${Number(match[1]).toString().padStart(2, '0')}:${match[2]}`
}

export type EquipmentBookingRow = {
  equipmentId: string
  quantity?: number | null
}

export type SlotEquipmentSnapshot = {
  date?: string
  startTime: string
  booking?: {
    id?: string
    status?: string | null
    bookingEquipments?: EquipmentBookingRow[]
  } | null
}

/** Sum equipment already booked on active slots at the same date + start time. */
export function sumBookedEquipmentFromSlots(
  slots: SlotEquipmentSnapshot[],
  equipmentId: string,
  date: string,
  startTime: string,
  excludeBookingId?: string,
): number {
  const normTime = normalizeSlotTime(startTime)
  let sum = 0
  for (const slot of slots) {
    const slotDate = slot.date || date
    if (slotDate !== date) continue
    if (normalizeSlotTime(slot.startTime) !== normTime) continue
    const booking = slot.booking
    if (!booking || booking.status === 'CANCELLED') continue
    if (excludeBookingId && booking.id === excludeBookingId) continue
    for (const row of booking.bookingEquipments || []) {
      if (row.equipmentId === equipmentId) {
        sum += Math.max(1, row.quantity || 1)
      }
    }
  }
  return sum
}

export function availableEquipmentQty(totalStock: number, booked: number): number {
  const stock = Math.max(0, totalStock)
  return Math.max(0, stock - Math.max(0, booked))
}

/** Minimum available across one or more time slices (strictest for multi-slot picks). */
export function minAvailableEquipmentAcrossTimes(
  slots: SlotEquipmentSnapshot[],
  equipmentId: string,
  date: string,
  startTimes: string[],
  totalStock: number,
  excludeBookingId?: string,
): number {
  const stock = Math.max(0, totalStock)
  if (stock < 1 || !startTimes.length) return stock
  let min = stock
  const seen = new Set<string>()
  for (const time of startTimes) {
    const norm = normalizeSlotTime(time)
    if (seen.has(norm)) continue
    seen.add(norm)
    const booked = sumBookedEquipmentFromSlots(slots, equipmentId, date, time, excludeBookingId)
    min = Math.min(min, availableEquipmentQty(stock, booked))
  }
  return min
}
