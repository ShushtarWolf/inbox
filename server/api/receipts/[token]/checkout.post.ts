import { randomBytes } from 'node:crypto'
import { isOnlinePaymentsEnabled, isPaidPaymentStatus, isPaymentPayableOnline } from '#shared/bookingPayment.ts'
import { parseReceiptToken, signReceiptToken } from '#shared/receiptToken.ts'
import { getPaymentsMode, PAYMENT_CURRENCY, type PaymentProvider } from '#shared/payments.ts'
import { getPaymentService } from '../../../utils/payments/service'
import { linkPaymentSupersededBy, supersedePayablePaymentForRetry } from '../../../utils/paymentSupersede'
import { receiptSigningSecret } from '../../../utils/receipt'

function parseMeta(raw: string | null | undefined) {
  if (!raw) return {} as Record<string, unknown>
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {} as Record<string, unknown>
  }
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') || ''
  const bookingId = parseReceiptToken(token, receiptSigningSecret())
  if (!bookingId) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  })
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (booking.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'Booking cancelled' })
  }

  let existingPayment = booking.payment
  if (existingPayment && isPaidPaymentStatus(existingPayment.status)) {
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

  if (!isOnlinePaymentsEnabled()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Online checkout is disabled; pay at the club',
    })
  }

  // Nullish only — sibling/comp amount 0 must stay 0 (never coerce via `||`).
  const payableAmount = existingPayment?.amount ?? 0
  if (payableAmount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid amount' })
  }

  // Keep series / multi-slot sibling links when replacing the payable row for IPG.
  let preservedMeta: Record<string, unknown> = {}
  let supersededPaymentId: string | null = null
  if (existingPayment && isPaymentPayableOnline(existingPayment.status)) {
    preservedMeta = parseMeta(existingPayment.metadataJson)
    const superseded = await supersedePayablePaymentForRetry(existingPayment).catch(async () => {
      const fresh = await prisma.payment.findUnique({ where: { id: existingPayment!.id }, select: { status: true } })
      return { superseded: false, status: fresh?.status || 'UNKNOWN' }
    })
    if (!superseded.superseded && (superseded.status === 'PAID' || superseded.status === 'REFUNDED')) {
      const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: existingPayment.id } })
      return {
        paymentId: fresh.id,
        mode: getPaymentsMode(),
        intent: {
          id: fresh.id,
          amount: fresh.amount,
          currency: PAYMENT_CURRENCY,
          status: fresh.status,
          provider: fresh.provider as PaymentProvider,
          providerRef: fresh.providerRef || undefined,
        },
      }
    }
    if (!superseded.superseded && superseded.status !== 'SUPERSEDED') {
      throw createError({ statusCode: 409, statusMessage: 'PAYMENT_VERIFY_PENDING' })
    }
    supersededPaymentId = superseded.superseded ? existingPayment.id : null
    existingPayment = null
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
  const session = await service.createIntent({
    amount: payableAmount,
    bookingId,
    idempotencyKey: randomBytes(16).toString('hex'),
  })

  if (supersededPaymentId && session.paymentId) {
    await linkPaymentSupersededBy(supersededPaymentId, session.paymentId)
  }

  const payment = await prisma.payment.findUnique({ where: { id: session.paymentId } })
  if (payment) {
    const meta = { ...preservedMeta, ...parseMeta(payment.metadataJson) }
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        metadataJson: JSON.stringify({
          ...meta,
          receiptToken: signReceiptToken(bookingId, receiptSigningSecret()),
        }),
      },
    })
  }

  return session
})
