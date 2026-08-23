import {
  availableEquipmentQty,
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

export async function availableEquipmentAtTime(opts: {
  clubId: string
  equipmentId: string
  date: string
  startTime: string
  totalStock: number
  excludeBookingId?: string
}): Promise<number> {
  const stock = Math.max(0, opts.totalStock)
  if (stock < 1) return 0
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
}): Promise<number> {
  const stock = Math.max(0, opts.totalStock)
  if (stock < 1 || !opts.startTimes.length) return stock
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
    })
    min = Math.min(min, available)
  }
  return min
}
