import { prisma } from './prisma'

const SPORTS = [
  { slug: 'padel', nameFa: 'پدل', nameEn: 'Padel', icon: 'padel' },
  { slug: 'tennis', nameFa: 'تنیس', nameEn: 'Tennis', icon: 'tennis' },
] as const

export async function catalogCounts() {
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

/** Delete all users/clubs and dependent data. Keeps Sport catalog. */
export async function wipeCatalog() {
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

      await tx.club.updateMany({ data: { ownerId: null } })
      await tx.coach.updateMany({ data: { userId: null } })
      await tx.bugReport.updateMany({ data: { userId: null } })

      await tx.coach.deleteMany()
      await tx.clubApplication.deleteMany()
      await tx.club.deleteMany()
      await tx.phoneOtp.deleteMany()
      await tx.user.deleteMany()
    },
    { timeout: 120_000 },
  )

  await ensureSports()
}
