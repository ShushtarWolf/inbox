import type { EquipmentCategory } from '@prisma/client'

const validCategories = new Set<EquipmentCategory>(['CLUB', 'RENTAL', 'SELL', 'SERVICE'])

function normalizePrice(category: EquipmentCategory, price?: number) {
  if (category === 'CLUB') return 0
  const value = Number(price ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{ nameFa?: string; nameEn?: string; category?: EquipmentCategory; price?: number }>(event)
  const category = body.category && validCategories.has(body.category) ? body.category : 'CLUB'
  return prisma.equipment.create({
    data: {
      clubId: club.id,
      nameFa: body.nameFa?.trim() || 'جدید',
      nameEn: body.nameEn?.trim() || 'New',
      category,
      price: normalizePrice(category, body.price),
    },
  })
})
