import type { EquipmentCategory } from '@prisma/client'

function normalizePrice(category: EquipmentCategory, price?: number) {
  if (category === 'CLUB') return 0
  const value = Number(price ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function normalizeQuantity(category: EquipmentCategory, quantity?: number) {
  if (category === 'CLUB') return 1
  const value = Number(quantity ?? 1)
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.min(999, Math.round(value))
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing equipment id' })

  const existing = await prisma.equipment.findFirst({ where: { id, clubId: club.id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Equipment not found' })

  const body = await readBody<{
    nameFa?: string
    nameEn?: string
    category?: EquipmentCategory
    price?: number
    quantity?: number
  }>(event)
  const data: {
    nameFa?: string
    nameEn?: string
    category?: EquipmentCategory
    price?: number
    quantity?: number
  } = {}

  if (body.nameFa !== undefined) {
    const value = body.nameFa.trim()
    if (!value) throw createError({ statusCode: 400, statusMessage: 'nameFa is required' })
    data.nameFa = value
  }
  if (body.nameEn !== undefined) {
    const value = body.nameEn.trim()
    if (!value) throw createError({ statusCode: 400, statusMessage: 'nameEn is required' })
    data.nameEn = value
  }
  if (body.category !== undefined) data.category = body.category

  const category = body.category ?? existing.category
  if (body.price !== undefined || body.category !== undefined) {
    data.price = normalizePrice(category, body.price ?? existing.price)
  }
  if (body.quantity !== undefined || body.category !== undefined) {
    data.quantity = normalizeQuantity(category, body.quantity ?? existing.quantity)
  }

  return prisma.equipment.update({ where: { id }, data })
})
