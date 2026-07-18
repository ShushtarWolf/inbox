import { getEmailStatus } from '../../utils/email'
import { getStorageStatus } from '../../utils/storage'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const [
    clubsTotal,
    clubsActive,
    clubsPending,
    clubsSuspended,
    usersTotal,
    usersAthlete,
    usersCoach,
    usersClubAdmin,
    usersDisabled,
    bookingsTotal,
    bookingsConfirmed,
    bookingsCancelled,
    bookingsPending,
    bookingsToday,
    paymentsAgg,
    paymentsPaid,
    paymentsPending,
    applicationsPending,
    bugReportsOpen,
  ] = await Promise.all([
    prisma.club.count(),
    prisma.club.count({ where: { status: 'ACTIVE' } }),
    prisma.club.count({ where: { status: 'PENDING' } }),
    prisma.club.count({ where: { status: 'SUSPENDED' } }),
    prisma.user.count(),
    prisma.user.count({ where: { role: 'ATHLETE' } }),
    prisma.user.count({ where: { role: 'COACH' } }),
    prisma.user.count({ where: { role: 'CLUB_ADMIN' } }),
    prisma.user.count({ where: { disabledAt: { not: null } } }),
    prisma.booking.count(),
    prisma.booking.count({ where: { status: 'CONFIRMED' } }),
    prisma.booking.count({ where: { status: 'CANCELLED' } }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.booking.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, _count: true }),
    prisma.payment.aggregate({
      where: { status: 'PAID' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.count({
      where: { status: { in: ['PENDING_AT_CLUB', 'PENDING_ONLINE', 'PAY_AT_CLUB'] } },
    }),
    prisma.clubApplication.count({ where: { status: 'PENDING' } }),
    prisma.bugReport.count({ where: { status: 'OPEN' } }),
  ])

  const email = getEmailStatus()
  const storage = getStorageStatus()

  return {
    clubs: {
      total: clubsTotal,
      active: clubsActive,
      pending: clubsPending,
      suspended: clubsSuspended,
    },
    users: {
      total: usersTotal,
      athlete: usersAthlete,
      coach: usersCoach,
      clubAdmin: usersClubAdmin,
      disabled: usersDisabled,
    },
    bookings: {
      total: bookingsTotal,
      confirmed: bookingsConfirmed,
      cancelled: bookingsCancelled,
      pending: bookingsPending,
      today: bookingsToday,
    },
    payments: {
      count: paymentsAgg._count,
      totalAmount: paymentsAgg._sum.amount || 0,
      paidCount: paymentsPaid._count,
      paidAmount: paymentsPaid._sum.amount || 0,
      pendingCount: paymentsPending,
    },
    applications: { pending: applicationsPending },
    bugReports: { open: bugReportsOpen },
    /** Safe email ops — never includes SMTP_PASS. */
    email: {
      emailConfigured: email.emailConfigured,
      emailMode: email.emailMode,
      emailEnabledFlag: email.emailEnabledFlag,
      hasSmtpHost: email.hasSmtpHost,
      note: email.note,
      warnings: email.warnings,
    },
    /** Safe storage ops — never includes S3 access/secret keys. */
    storage: {
      storageMode: storage.storageMode,
      s3Configured: storage.s3Configured,
      hasEndpoint: storage.hasEndpoint,
      hasBucket: storage.hasBucket,
      hasPublicUrl: storage.hasPublicUrl,
      bucket: storage.bucket,
      publicUrlHost: storage.publicUrlHost,
      note: storage.note,
      warnings: storage.warnings,
    },
  }
})
