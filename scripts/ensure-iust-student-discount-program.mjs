#!/usr/bin/env node
/**
 * Ensures IUST (iust-tennis) has an active 50% student verification discount program.
 * Safe to run multiple times (upsert by club + verificationKind + title).
 *
 * Usage: node scripts/ensure-iust-student-discount-program.mjs
 */
import { PrismaClient } from '@prisma/client'
import { defaultPilotClubWhere } from '../shared/pilotClub.ts'
import { IUST_STUDENT_DISCOUNT_PERCENT } from '../shared/studentVerification.ts'

const db = new PrismaClient()

const TITLE_FA = 'تخفیف دانشجویی (۵۰٪)'
const INSTRUCTIONS_FA =
  'برای استفاده از تخفیف ۵۰ درصدی زمین تنیس دانشگاه علم و صنعت، کارت دانشجویی معتبر ارسال کنید.'

async function main() {
  const club = await db.club.findFirst({
    where: defaultPilotClubWhere(),
    select: { id: true, slug: true, nameFa: true },
  })
  if (!club) {
    console.error('[ensure-iust-student] Pilot club not found')
    process.exit(1)
  }

  const existing = await db.discountProgram.findFirst({
    where: {
      clubId: club.id,
      verificationKind: 'STUDENT',
      active: true,
    },
  })

  if (existing) {
    const updated = await db.discountProgram.update({
      where: { id: existing.id },
      data: {
        percent: IUST_STUDENT_DISCOUNT_PERCENT,
        titleFa: TITLE_FA,
        titleEn: 'IUST student discount (50%)',
        instructionsFa: INSTRUCTIONS_FA,
        instructionsEn: INSTRUCTIONS_FA,
        active: true,
      },
    })
    console.log('[ensure-iust-student] Updated program', updated.id, club.slug)
    return
  }

  const created = await db.discountProgram.create({
    data: {
      clubId: club.id,
      titleFa: TITLE_FA,
      titleEn: 'IUST student discount (50%)',
      percent: IUST_STUDENT_DISCOUNT_PERCENT,
      instructionsFa: INSTRUCTIONS_FA,
      instructionsEn: INSTRUCTIONS_FA,
      verificationKind: 'STUDENT',
      active: true,
      validityMonths: null,
    },
  })
  console.log('[ensure-iust-student] Created program', created.id, club.slug)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
