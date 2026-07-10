import { randomBytes } from 'node:crypto'
import { getPaymentService } from '../../utils/payments/service'
import { getPaymentsMode } from '#shared/payments.ts'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ bookingId?: string; coachSessionId?: string }>(event)
  if (!body.bookingId && !body.coachSessionId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  let amount = 0
  if (body.bookingId) {
    const booking = await prisma.booking.findFirst({
      where: { id: body.bookingId, userId: user.id },
      include: { slot: true, payment: true },
    })
    if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    amount = booking.payment?.amount || booking.slot.price
  }

  const mode = getPaymentsMode()
  const provider = mode === 'live' ? 'zarinpal' : 'pay_at_club'
  const service = getPaymentService(provider)
  const idempotencyKey = randomBytes(16).toString('hex')

  return service.createIntent({
    amount,
    bookingId: body.bookingId,
    coachSessionId: body.coachSessionId,
    idempotencyKey,
  })
})
