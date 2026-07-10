import type { EquipmentCategory } from '@prisma/client'

const validCategories = new Set<EquipmentCategory>(['CLUB', 'RENTAL', 'SELL', 'SERVICE'])

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  const body = await readBody<{ nameFa?: string; nameEn?: string; category?: EquipmentCategory }>(event)
  const category = body.category && validCategories.has(body.category) ? body.category : 'CLUB'
  return prisma.equipment.create({
    data: {
      clubId: club.id,
      nameFa: body.nameFa?.trim() || 'جدید',
      nameEn: body.nameEn?.trim() || 'New',
      category,
    },
  })
})
