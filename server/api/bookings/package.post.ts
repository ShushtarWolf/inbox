import { assertPackagesEnabled } from '../../utils/packagesGate'
import { bookPackageSeat } from '../../utils/packages'
import {
  clubNotifyLocation,
  clubNotifyName,
  notifyBookingConfirmed,
  notifyOwnerBookingConfirmed,
  ownerNotifyPhone,
  personNotifyName,
} from '../../utils/bookingNotify'
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
    include: { club: { include: { owner: { select: { phone: true } } } } },
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
    await notifyOwnerBookingConfirmed({
      ownerPhone: ownerNotifyPhone(pkg.club),
      clubName: clubNotifyName(pkg.club),
      clubId: pkg.clubId,
      bookingId: booking.id,
      guestName: personNotifyName(athlete?.name),
      guestPhone: athlete?.phone,
      sessions: [{
        courtName: pkg.title || 'پکیج',
        date: pkg.startDate || '',
        startTime: pkg.title || '',
      }],
    })
  }

  return booking
})
