import {
  availableEquipmentQty,
  availableSellEquipmentQty,
  isSellEquipmentCategory,
  normalizeSlotTime,
} from '#shared/equipmentAvailability.ts'

export type EquipmentSlotContext = {
  date: string
  startTime: string
  excludeBookingId?: string
}

export async function sumBookedEquipmentAtTime(opts: {
  clubId: string
  equipmentId: string
  date: string
  startTime: string
  excludeBookingId?: string
}): Promise<number> {
  const startTime = normalizeSlotTime(opts.startTime)
  const rows = await prisma.bookingEquipment.findMany({
    where: {
      equipmentId: opts.equipmentId,
      booking: {
        status: { not: 'CANCELLED' },
        ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
        slot: {
          date: opts.date,
          startTime,
          court: { clubId: opts.clubId },
        },
      },
    },
    select: { quantity: true },
  })
  return rows.reduce((sum, row) => sum + Math.max(1, row.quantity || 1), 0)
}

/** Sum units already sold for a SELL item across all non-cancelled bookings. */
export async function sumSoldEquipment(opts: {
  clubId: string
  equipmentId: string
  excludeBookingId?: string
}): Promise<number> {
  const rows = await prisma.bookingEquipment.findMany({
    where: {
      equipmentId: opts.equipmentId,
      booking: {
        status: { not: 'CANCELLED' },
        ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
        slot: {
          court: { clubId: opts.clubId },
        },
      },
    },
    select: { quantity: true },
  })
  return rows.reduce((sum, row) => sum + Math.max(1, row.quantity || 1), 0)
}

export async function availableSellEquipment(opts: {
  clubId: string
  equipmentId: string
  totalStock: number
  excludeBookingId?: string
}): Promise<number> {
  const stock = Math.max(0, opts.totalStock)
  if (stock < 1) return 0
  const sold = await sumSoldEquipment(opts)
  return availableSellEquipmentQty(stock, sold)
}

export async function availableEquipmentAtTime(opts: {
  clubId: string
  equipmentId: string
  date: string
  startTime: string
  totalStock: number
  excludeBookingId?: string
  category?: string | null
}): Promise<number> {
  const stock = Math.max(0, opts.totalStock)
  if (stock < 1) return 0
  if (isSellEquipmentCategory(opts.category)) {
    return availableSellEquipment({
      clubId: opts.clubId,
      equipmentId: opts.equipmentId,
      totalStock: stock,
      excludeBookingId: opts.excludeBookingId,
    })
  }
  const booked = await sumBookedEquipmentAtTime(opts)
  return availableEquipmentQty(stock, booked)
}

export async function minAvailableEquipmentAcrossTimes(opts: {
  clubId: string
  equipmentId: string
  date: string
  startTimes: string[]
  totalStock: number
  excludeBookingId?: string
  category?: string | null
}): Promise<number> {
  const stock = Math.max(0, opts.totalStock)
  if (stock < 1) return 0
  if (isSellEquipmentCategory(opts.category)) {
    return availableSellEquipment({
      clubId: opts.clubId,
      equipmentId: opts.equipmentId,
      totalStock: stock,
      excludeBookingId: opts.excludeBookingId,
    })
  }
  if (!opts.startTimes.length) return stock
  let min = stock
  const seen = new Set<string>()
  for (const time of opts.startTimes) {
    const norm = normalizeSlotTime(time)
    if (seen.has(norm)) continue
    seen.add(norm)
    const available = await availableEquipmentAtTime({
      clubId: opts.clubId,
      equipmentId: opts.equipmentId,
      date: opts.date,
      startTime: norm,
      totalStock: stock,
      excludeBookingId: opts.excludeBookingId,
      category: opts.category,
    })
    min = Math.min(min, available)
  }
  return min
}
