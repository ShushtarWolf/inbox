import type { Equipment, Prisma } from '@prisma/client'
import { availableEquipmentAtTime, type EquipmentSlotContext } from './equipmentAvailability'

export type EquipmentRow = Pick<Equipment, 'id' | 'price' | 'category'>

/** Equipment line for a booking: unit price fields + booked quantity. */
export type EquipmentBookingItem = EquipmentRow & {
  quantity: number
}

export type EquipmentSelectionInput = {
  id: string
  quantity: number
}

export function equipmentPriceAtBooking(item: EquipmentRow): number {
  if (item.category === 'CLUB') return 0
  return item.price
}

export function equipmentLineTotal(item: EquipmentBookingItem): number {
  return equipmentPriceAtBooking(item) * Math.max(1, item.quantity || 1)
}

export function sumEquipmentPrices(items: EquipmentBookingItem[]): number {
  return items.reduce((sum, item) => sum + equipmentLineTotal(item), 0)
}

export function calculateSessionTotal(opts: {
  courtPrice: number
  equipmentPrices?: number[]
  coachPrice?: number
}): number {
  const equipmentTotal = (opts.equipmentPrices || []).reduce((sum, price) => sum + price, 0)
  return opts.courtPrice + equipmentTotal + (opts.coachPrice || 0)
}

/** Normalize API body into unique id + quantity (>= 1) selections. */
export function parseEquipmentSelections(
  equipmentIds?: string[],
  equipmentQuantities?: Record<string, number> | null,
): EquipmentSelectionInput[] {
  const ids = [...new Set((equipmentIds || []).filter(Boolean))]
  return ids.map((id) => {
    const raw = equipmentQuantities?.[id]
    const parsed = Number(raw)
    const quantity = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 1
    return { id, quantity: Math.max(1, quantity) }
  })
}

export type { EquipmentSlotContext }

export async function loadEquipmentForBooking(
  clubId: string,
  selections: EquipmentSelectionInput[],
  slotContext?: EquipmentSlotContext,
): Promise<EquipmentBookingItem[]> {
  if (!selections.length) return []
  const rows = await prisma.equipment.findMany({
    where: { clubId, id: { in: selections.map((s) => s.id) } },
    select: { id: true, price: true, category: true, quantity: true },
  })
  const byId = new Map(rows.map((row) => [row.id, row]))
  const items: EquipmentBookingItem[] = []
  for (const selection of selections) {
    const row = byId.get(selection.id)
    if (!row) continue
    const stock = Math.max(0, row.quantity ?? 1)
    let maxQty = stock
    if (slotContext) {
      maxQty = await availableEquipmentAtTime({
        clubId,
        equipmentId: row.id,
        date: slotContext.date,
        startTime: slotContext.startTime,
        totalStock: stock,
        excludeBookingId: slotContext.excludeBookingId,
      })
    }
    if (maxQty < 1) {
      throw createError({ statusCode: 400, statusMessage: 'Equipment out of stock' })
    }
    if (selection.quantity > maxQty) {
      throw createError({ statusCode: 400, statusMessage: 'Equipment quantity exceeds stock' })
    }
    items.push({
      id: row.id,
      price: row.price,
      category: row.category,
      quantity: selection.quantity,
    })
  }
  return items
}

export async function syncBookingEquipments(
  tx: Prisma.TransactionClient,
  bookingId: string,
  items: EquipmentBookingItem[],
) {
  await tx.bookingEquipment.deleteMany({ where: { bookingId } })
  if (!items.length) return
  await tx.bookingEquipment.createMany({
    data: items.map((item) => ({
      bookingId,
      equipmentId: item.id,
      quantity: Math.max(1, item.quantity || 1),
      priceAtBooking: equipmentPriceAtBooking(item),
    })),
  })
}
