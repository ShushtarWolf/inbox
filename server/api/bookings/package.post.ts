import { assertPackagesEnabled } from '../../utils/packagesGate'
import { bookPackageSeat } from '../../utils/packages'
import { notifyBookingConfirmed, clubNotifyName, clubNotifyLocation, personNotifyName } from '../../utils/bookingNotify'
import { requireOnlinePaymentsForAthlete } from '../../utils/requireOnlinePayments'

export default defineEventHandler(async (event) => {
  assertPackagesEnabled(event)
  const user = await requireUser(event)
  requireOnlinePaymentsForAthlete()
  const body = await readBody<{ packageId?: string; days?: string[]; times?: string[] }>(event)
  if (!body.packageId) {
    throw createError({ statusCode: 400, statusMessage: 'packageId required' })
  }

  const booking = await bookPackageSeat({
    packageId: body.packageId,
    athleteId: user.id,
    days: body.days,
    times: body.times,
  })

  const pkg = await prisma.packageDraft.findUnique({
    where: { id: body.packageId },
    include: { club: true },
  })
  const athlete = await prisma.user.findUnique({ where: { id: user.id } })
  if (pkg) {
    await notifyBookingConfirmed({
      userId: user.id,
      email: athlete?.email,
      phone: athlete?.phone,
      kind: 'package',
      clubName: clubNotifyName(pkg.club),
      clubId: pkg.clubId,
      bookingId: booking.id,
      date: pkg.startDate || '',
      startTime: pkg.title,
      paymentPaid: false,
      guestName: personNotifyName(athlete?.name),
      ...clubNotifyLocation(pkg.club),
    })
  }

  return booking
})
