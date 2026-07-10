import type { Equipment, Prisma } from '@prisma/client'

type EquipmentRow = Pick<Equipment, 'id' | 'price' | 'category'>

export function equipmentPriceAtBooking(item: EquipmentRow): number {
  if (item.category === 'CLUB') return 0
  return item.price
}

export function sumEquipmentPrices(items: EquipmentRow[]): number {
  return items.reduce((sum, item) => sum + equipmentPriceAtBooking(item), 0)
}

export function calculateSessionTotal(opts: {
  courtPrice: number
  equipmentPrices?: number[]
  coachPrice?: number
}): number {
  const equipmentTotal = (opts.equipmentPrices || []).reduce((sum, price) => sum + price, 0)
  return opts.courtPrice + equipmentTotal + (opts.coachPrice || 0)
}

export async function loadEquipmentForBooking(
  clubId: string,
  equipmentIds: string[],
): Promise<EquipmentRow[]> {
  if (!equipmentIds.length) return []
  return prisma.equipment.findMany({
    where: { clubId, id: { in: equipmentIds } },
    select: { id: true, price: true, category: true },
  })
}

export async function syncBookingEquipments(
  tx: Prisma.TransactionClient,
  bookingId: string,
  items: EquipmentRow[],
) {
  await tx.bookingEquipment.deleteMany({ where: { bookingId } })
  if (!items.length) return
  await tx.bookingEquipment.createMany({
    data: items.map((item) => ({
      bookingId,
      equipmentId: item.id,
      priceAtBooking: equipmentPriceAtBooking(item),
    })),
  })
}
