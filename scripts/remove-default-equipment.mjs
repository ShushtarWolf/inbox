#!/usr/bin/env node
/**
 * One-shot: remove auto-seeded free default equipment (price 0, RENTAL/SERVICE,
 * exact legacy default names). Custom or priced items are never touched.
 *
 * Dry run (counts only):  node scripts/remove-default-equipment.mjs
 * Apply:                  CONFIRM=REMOVE_DEFAULT_EQUIPMENT node scripts/remove-default-equipment.mjs
 * Optional:               CLUB_ID=<id> to limit to one club.
 */
import { PrismaClient } from '@prisma/client'

const NAMES = ['راکت', 'سبد توپ', 'توپ', 'سبد توپ جمع‌کن', 'شخص توپ جمع‌کن', 'توپ جمع‌کن', 'توپ جمع کن']
const prisma = new PrismaClient()
const where = {
  price: 0,
  category: { in: ['RENTAL', 'SERVICE'] },
  nameFa: { in: NAMES },
  ...(process.env.CLUB_ID ? { clubId: process.env.CLUB_ID } : {}),
}
try {
  const count = await prisma.equipment.count({ where })
  if (process.env.CONFIRM !== 'REMOVE_DEFAULT_EQUIPMENT') {
    console.log(`Dry run: ${count} default equipment rows would be deleted.`)
  } else {
    const { count: deleted } = await prisma.equipment.deleteMany({ where })
    console.log(`Deleted ${deleted} default equipment rows.`)
  }
} finally {
  await prisma.$disconnect()
}
