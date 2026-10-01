import { seedDefaultEquipment } from '../../../utils/seedDefaultEquipment'

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  // Only backfill an empty club. Reseeding "missing" defaults on every GET
  // resurrected deleted/renamed catalog items and wiped owner edits.
  const count = await prisma.equipment.count({ where: { clubId: club.id } })
  if (count === 0) await seedDefaultEquipment(prisma, club.id)
  return prisma.equipment.findMany({ where: { clubId: club.id }, orderBy: { category: 'asc' } })
})
