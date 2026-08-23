import type { Prisma } from '@prisma/client'
import { defaultEquipmentMissing } from '#shared/defaultEquipment.ts'

type Db = Prisma.TransactionClient | typeof prisma

export async function seedDefaultEquipment(db: Db, clubId: string) {
  const existing = await db.equipment.findMany({
    where: { clubId },
    select: { nameFa: true, nameEn: true },
  })
  const missing = defaultEquipmentMissing(existing)
  if (!missing.length) return 0
  await db.equipment.createMany({
    data: missing.map((item) => ({ ...item, clubId })),
  })
  return missing.length
}
