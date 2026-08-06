#!/usr/bin/env node
/**
 * Set all court / catalog / free-slot prices to a low test amount (SEP IPG smoke).
 *
 * Usage:
 *   TEST_COURT_PRICE=1001 node scripts/set-test-court-price.mjs
 */
import { PrismaClient } from '@prisma/client'

const PRICE = Math.max(1, Math.round(Number(process.env.TEST_COURT_PRICE || 1001)))
const prisma = new PrismaClient()

async function main() {
  const courts = await prisma.court.updateMany({ data: { price: PRICE, pricingJson: null } })
  const clubs = await prisma.club.updateMany({ data: { priceFrom: PRICE, priceTo: PRICE } })
  const freeSlots = await prisma.slot.updateMany({
    where: { displayStatus: 'FREE' },
    data: { price: PRICE },
  })
  const openSlots = await prisma.slot.updateMany({
    where: { booking: { is: null } },
    data: { price: PRICE },
  })
  const sample = await prisma.club.findMany({
    select: { slug: true, priceFrom: true, priceTo: true },
    orderBy: { slug: 'asc' },
  })
  console.log(JSON.stringify({
    price: PRICE,
    courts: courts.count,
    clubs: clubs.count,
    freeSlots: freeSlots.count,
    openSlots: openSlots.count,
    sample,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
