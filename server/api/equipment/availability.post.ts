import { minAvailableEquipmentAcrossTimes, availableSellEquipment } from '../../utils/equipmentAvailability'
import { isSellEquipmentCategory, normalizeSlotTime } from '#shared/equipmentAvailability.ts'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    clubId?: string
    date?: string
    startTimes?: string[]
    equipmentIds?: string[]
    excludeBookingId?: string
  }>(event)

  const clubId = body.clubId?.trim()
  const date = body.date?.trim()
  const equipmentIds = [...new Set((body.equipmentIds || []).filter(Boolean))]
  const startTimes = [...new Set((body.startTimes || []).map((t) => normalizeSlotTime(t)).filter(Boolean))]

  if (!clubId || !equipmentIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'clubId and equipmentIds required' })
  }

  const club = await prisma.club.findFirst({
    where: { id: clubId, status: 'ACTIVE' },
    select: { id: true },
  })
  if (!club) throw createError({ statusCode: 404, statusMessage: 'Club not found' })

  const rows = await prisma.equipment.findMany({
    where: { clubId, id: { in: equipmentIds } },
    select: { id: true, quantity: true, category: true },
  })

  const available: Record<string, number> = {}
  for (const row of rows) {
    const totalStock = Math.max(0, row.quantity ?? 1)
    if (isSellEquipmentCategory(row.category)) {
      available[row.id] = await availableSellEquipment({
        clubId,
        equipmentId: row.id,
        totalStock,
        excludeBookingId: body.excludeBookingId,
      })
      continue
    }
    if (!date || !startTimes.length) {
      available[row.id] = totalStock
      continue
    }
    available[row.id] = await minAvailableEquipmentAcrossTimes({
      clubId,
      equipmentId: row.id,
      date,
      startTimes,
      totalStock,
      excludeBookingId: body.excludeBookingId,
      category: row.category,
    })
  }

  return { available }
})
