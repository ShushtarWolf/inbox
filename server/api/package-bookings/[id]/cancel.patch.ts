import { cancelPackageBooking } from '../../utils/cancellations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const booking = await prisma.packageBooking.findFirst({
    where: { id, athleteId: user.id },
    include: { package: { include: { club: true } }, payment: true },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (booking.status === 'CANCELLED') return { ok: true }

  return cancelPackageBooking({
    packageBookingId: id!,
    actorUserId: user.id,
    reason: 'athlete-cancel',
    paymentId: booking.payment?.id,
    userId: user.id,
  })
})
