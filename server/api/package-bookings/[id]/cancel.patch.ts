import { notifyBookingCancelled } from '../../../utils/bookingNotify'
import { cancelPackageBooking } from '../../../utils/cancellations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const booking = await prisma.packageBooking.findFirst({
    where: { id, athleteId: user.id },
    include: { package: { include: { club: true } }, payment: true, athlete: true },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (booking.status === 'CANCELLED') return { ok: true }

  const result = await cancelPackageBooking({
    packageBookingId: id!,
    actorUserId: user.id,
    reason: 'athlete-cancel',
    paymentId: booking.payment?.id,
    userId: user.id,
  })

  await notifyBookingCancelled({
    userId: user.id,
    email: booking.athlete?.email,
    kind: 'package',
    clubName: booking.package.club.nameEn || booking.package.club.nameFa,
    clubId: booking.package.clubId,
    bookingId: booking.id,
    date: booking.package.startDate || '',
    startTime: booking.package.title,
    reason: 'athlete-cancel',
  })

  return result
})
