import { seedDefaultEquipment } from '../../../utils/seedDefaultEquipment'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  await seedDefaultEquipment(prisma, club.id)
  return prisma.equipment.findMany({ where: { clubId: club.id }, orderBy: { category: 'asc' } })
})
