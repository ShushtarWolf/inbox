import { randomBytes } from 'node:crypto'
import { computeBookingPrice } from '#shared/courtPricing.ts'
import { isOnlinePaymentsEnabled, isPaymentPayableOnline } from '#shared/bookingPayment.ts'
import { getPaymentsMode, PAYMENT_CURRENCY, type PaymentProvider } from '#shared/payments.ts'
import { getPaymentService } from '../../utils/payments/service'
import { syncPaymentToParent } from '../../utils/paymentSync'
import { debitWallet } from '../../utils/wallet'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    bookingId?: string
    coachSessionId?: string
    packageBookingId?: string
    useWallet?: boolean
  }>(event)
  if (!body.bookingId && !body.coachSessionId && !body.packageBookingId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  let amount = 0
  let existingPayment: {
    id: string
    amount: number
    status: string
    provider: string
    providerRef: string | null
    method: string
  } | null = null

  if (body.bookingId) {
    const booking = await prisma.booking.findFirst({
      where: { id: body.bookingId, userId: user.id },
      include: { slot: { include: { court: true } }, payment: true },
    })
    if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    if (booking.payment) existingPayment = booking.payment
    else {
      amount = computeBookingPrice(
        booking.slot.price,
        booking.slot.court.pricingJson,
        booking.slot.date,
        booking.slot.startTime,
      )
    }
  } else if (body.coachSessionId) {
    const session = await prisma.coachSession.findFirst({
      where: { id: body.coachSessionId, athleteId: user.id },
      include: { payment: true },
    })
    if (!session) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    if (session.payment) existingPayment = session.payment
    else amount = session.price
  } else if (body.packageBookingId) {
    const pkg = await prisma.packageBooking.findFirst({
      where: { id: body.packageBookingId, athleteId: user.id },
      include: { payment: true },
    })
    if (!pkg) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    if (pkg.payment) existingPayment = pkg.payment
    else amount = pkg.price
  }

  if (existingPayment?.status === 'PAID') {
    return {
      paymentId: existingPayment.id,
      mode: getPaymentsMode(),
      intent: {
        id: existingPayment.id,
        amount: existingPayment.amount,
        currency: PAYMENT_CURRENCY,
        status: existingPayment.status,
        provider: existingPayment.provider as PaymentProvider,
        providerRef: existingPayment.providerRef || undefined,
      },
    }
  }

  const payableAmount = existingPayment?.amount || amount

  if (body.useWallet && payableAmount > 0) {
    const payment = await prisma.$transaction(async (tx) => {
      await debitWallet(user.id, payableAmount, {
        bookingId: body.bookingId,
        note: 'Booking payment from wallet',
      }, tx)

      if (existingPayment) {
        return tx.payment.update({
          where: { id: existingPayment.id },
          data: { status: 'PAID', method: 'PAID', provider: 'pay_at_club' },
        })
      }

      return tx.payment.create({
        data: {
          amount: payableAmount,
          method: 'PAID',
          status: 'PAID',
          provider: 'pay_at_club',
          bookingId: body.bookingId,
          coachSessionId: body.coachSessionId,
          packageBookingId: body.packageBookingId,
        },
      })
    })
    await syncPaymentToParent(payment.id)
    return {
      paymentId: payment.id,
      mode: getPaymentsMode(),
      intent: {
        id: payment.id,
        amount: payment.amount,
        currency: PAYMENT_CURRENCY,
        status: 'PAID',
        provider: 'pay_at_club' as PaymentProvider,
      },
    }
  }

  if (!isOnlinePaymentsEnabled()) {
    if (existingPayment) {
      return {
        paymentId: existingPayment.id,
        mode: getPaymentsMode(),
        intent: {
          id: existingPayment.id,
          amount: existingPayment.amount,
          currency: PAYMENT_CURRENCY,
          status: existingPayment.status,
          provider: existingPayment.provider as PaymentProvider,
          providerRef: existingPayment.providerRef || undefined,
        },
      }
    }
    throw createError({
      statusCode: 400,
      statusMessage: 'Online checkout is disabled; pay at the club or use wallet balance',
    })
  }

  if (existingPayment && isPaymentPayableOnline(existingPayment.status)) {
    await prisma.payment.delete({ where: { id: existingPayment.id } })
    existingPayment = null
    amount = payableAmount
  } else if (existingPayment) {
    return {
      paymentId: existingPayment.id,
      mode: getPaymentsMode(),
      intent: {
        id: existingPayment.id,
        amount: existingPayment.amount,
        currency: PAYMENT_CURRENCY,
        status: existingPayment.status,
        provider: existingPayment.provider as PaymentProvider,
        providerRef: existingPayment.providerRef || undefined,
      },
    }
  }

  const service = getPaymentService()
  const idempotencyKey = randomBytes(16).toString('hex')

  const session = await service.createIntent({
    amount: payableAmount,
    bookingId: body.bookingId,
    coachSessionId: body.coachSessionId,
    packageBookingId: body.packageBookingId,
    idempotencyKey,
  })
  await syncPaymentToParent(session.paymentId)
  return session
})
