#!/usr/bin/env node
/**
 * One-shot wipe: delete all clubs, users, and dependent data.
 * Keeps Sport catalog (upserts padel/tennis if missing).
 * Does NOT seed demo users.
 *
 * Usage (requires explicit confirm):
 *   CONFIRM=WIPE_ALL_USERS_AND_CLUBS node scripts/wipe-prod-catalog.mjs
 *
 * Safety:
 *   - Refuses NODE_ENV=production unless ALLOW_PROD_WIPE=yes
 *   - Prints counts only (no emails, connection strings, or row payloads)
 */
import { PrismaClient } from '@prisma/client'

const CONFIRM = 'WIPE_ALL_USERS_AND_CLUBS'
const SPORTS = [
  { slug: 'padel', nameFa: 'پدل', nameEn: 'Padel', icon: 'padel' },
  { slug: 'tennis', nameFa: 'تنیس', nameEn: 'Tennis', icon: 'tennis' },
]

if (process.env.CONFIRM !== CONFIRM) {
  console.error(`Refusing to run without CONFIRM=${CONFIRM}`)
  process.exit(1)
}

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_WIPE !== 'yes') {
  console.error('Refusing production wipe without ALLOW_PROD_WIPE=yes')
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const prisma = new PrismaClient()

async function counts() {
  const [users, clubs, bookings, sports, coaches, applications, otps] = await Promise.all([
    prisma.user.count(),
    prisma.club.count(),
    prisma.booking.count(),
    prisma.sport.count(),
    prisma.coach.count(),
    prisma.clubApplication.count(),
    prisma.phoneOtp.count(),
  ])
  return { users, clubs, bookings, sports, coaches, applications, otps }
}

async function ensureSports() {
  for (const s of SPORTS) {
    await prisma.sport.upsert({ where: { slug: s.slug }, update: s, create: s })
  }
}

async function wipe() {
  // Ordered deletes covering models FORCE_SEED_RESET misses.
  // Null owner/coach user FKs before deleting users.
  await prisma.$transaction(
    async (tx) => {
      await tx.campaignRecipient.deleteMany()
      await tx.campaign.deleteMany()
      await tx.contactSegment.deleteMany()
      await tx.reminderRule.deleteMany()
      await tx.payment.deleteMany()
      await tx.reservationEvent.deleteMany()
      await tx.waitlistEntry.deleteMany()
      await tx.review.deleteMany()
      await tx.bookingEquipment.deleteMany()
      await tx.notification.deleteMany()
      await tx.walletTransaction.deleteMany()
      await tx.wallet.deleteMany()
      await tx.passwordResetToken.deleteMany()
      await tx.clubMedia.deleteMany()
      await tx.coachMedia.deleteMany()
      await tx.staffMembership.deleteMany()
      await tx.clubWorker.deleteMany()
      await tx.smsLog.deleteMany()
      await tx.contact.deleteMany()
      await tx.packagePlayer.deleteMany()
      await tx.packageBooking.deleteMany()
      await tx.packageDraft.deleteMany()
      await tx.seasonBooking.deleteMany()
      await tx.booking.deleteMany()
      await tx.coachSession.deleteMany()
      await tx.coachAvailability.deleteMany()
      await tx.slot.deleteMany()
      await tx.equipment.deleteMany()
      await tx.court.deleteMany()

      // Detach user FKs that lack onDelete Cascade / SetNull
      await tx.club.updateMany({ data: { ownerId: null } })
      await tx.coach.updateMany({ data: { userId: null } })
      await tx.bugReport.updateMany({ data: { userId: null } })

      await tx.coach.deleteMany()
      await tx.clubApplication.deleteMany()
      await tx.club.deleteMany()
      await tx.phoneOtp.deleteMany()
      await tx.user.deleteMany()
      // KEEP Sport rows — re-upsert below for safety
    },
    { timeout: 120_000 },
  )

  await ensureSports()
}

try {
  const before = await counts()
  console.log('before', JSON.stringify(before))

  await wipe()

  const after = await counts()
  console.log('after', JSON.stringify(after))

  const ok =
    after.users === 0 &&
    after.clubs === 0 &&
    after.bookings === 0 &&
    after.coaches === 0 &&
    after.applications === 0 &&
    after.otps === 0 &&
    after.sports >= 1

  if (!ok) {
    console.error('Wipe verification failed')
    process.exit(1)
  }

  console.log('wipe_ok sports_kept=true demo_seeded=false')
} finally {
  await prisma.$disconnect()
}
