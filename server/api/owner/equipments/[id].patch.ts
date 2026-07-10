import type { EquipmentCategory } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing equipment id' })

  const existing = await prisma.equipment.findFirst({ where: { id, clubId: club.id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Equipment not found' })

  const body = await readBody<{ nameFa?: string; nameEn?: string; category?: EquipmentCategory }>(event)
  const data: { nameFa?: string; nameEn?: string; category?: EquipmentCategory } = {}

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

  return prisma.equipment.update({ where: { id }, data })
})
