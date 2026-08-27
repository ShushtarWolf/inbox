import { randomBytes } from 'node:crypto'
import { computeBookingPrice, computeListedSlotPrice } from '#shared/courtPricing.ts'
import { isOnlinePaymentsEnabled, isPaymentPayableOnline } from '#shared/bookingPayment.ts'
import {
  buildCompetitionWalletPaymentCreateData,
  competitionJoinIdempotencyKey,
} from '#shared/competition.ts'
import { getPaymentsMode, PAYMENT_CURRENCY, type PaymentProvider } from '#shared/payments.ts'
import { canCoverBookingWithWallet } from '#shared/walletTopUp.ts'
import { getPaymentService } from '../../utils/payments/service'
import {
  assertOnlineHoldPayable,
  releaseExpiredOnlinePaymentHolds,
} from '../../utils/onlinePaymentHold'
import { notifyPaymentPaidIfNeeded, syncCompetitionEntryOnPayment, syncPaymentToParent } from '../../utils/paymentSync'
import { creditOwnerForPaidPayment } from '../../utils/settlement'
import { debitWallet, getWalletBalance } from '../../utils/wallet'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    bookingId?: string
    coachSessionId?: string
    packageBookingId?: string
    competitionEntryId?: string
    useWallet?: boolean
  }>(event)
  if (!body.bookingId && !body.coachSessionId && !body.packageBookingId && !body.competitionEntryId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid input' })
  }

  let amount = 0
  let competitionId: string | undefined
  let existingPayment: {
    id: string
    amount: number
    status: string
    provider: string
    providerRef: string | null
    method: string
  } | null = null

  if (body.bookingId) {
    await releaseExpiredOnlinePaymentHolds({ bookingIds: [body.bookingId] })
    const booking = await prisma.booking.findFirst({
      where: { id: body.bookingId, userId: user.id },
      include: { slot: { include: { court: true } }, payment: true },
    })
    if (!booking) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    assertOnlineHoldPayable({
      source: booking.source,
      status: booking.status,
      paymentStatus: booking.payment?.status || booking.paymentStatus,
      createdAt: booking.createdAt,
    })
    if (booking.payment) existingPayment = booking.payment
    else {
      amount = computeBookingPrice(
        computeListedSlotPrice(
          booking.slot.court.price,
          booking.slot.startTime,
          booking.slot.court.pricingJson,
        ),
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
  } else if (body.competitionEntryId) {
    const entry = await prisma.competitionEntry.findFirst({
      where: { id: body.competitionEntryId, athleteId: user.id },
      include: { payment: true, competition: true },
    })
    if (!entry) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    if (entry.status !== 'PENDING') {
      throw createError({ statusCode: 409, statusMessage: 'Entry not pending payment' })
    }
    competitionId = entry.competitionId
    if (entry.payment) existingPayment = entry.payment
    else amount = entry.competition.entryFee
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

  // Always charge the stored payment (slot + equipment + discount). Never recompute
  // slot-only price — court booking already wrote the sheet total on Payment.amount.
  const payableAmount = existingPayment?.amount || amount

  if (body.useWallet && payableAmount > 0) {
    const balance = await getWalletBalance(user.id)
    if (!canCoverBookingWithWallet(balance, payableAmount)) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient wallet balance' })
    }
    const previousStatus = existingPayment?.status || ''
    const payment = await prisma.$transaction(async (tx) => {
      await debitWallet(user.id, payableAmount, {
        bookingId: body.bookingId,
        note: body.competitionEntryId
          ? 'Competition entry payment from wallet'
          : 'Booking payment from wallet',
      }, tx)

      if (existingPayment) {
        return tx.payment.update({
          where: { id: existingPayment.id },
          data: { status: 'PAID', method: 'PAID', provider: 'pay_at_club' },
        })
      }

      if (body.competitionEntryId && competitionId) {
        const created = await tx.payment.create({
          data: buildCompetitionWalletPaymentCreateData({
            amount: payableAmount,
            userId: user.id,
            competitionEntryId: body.competitionEntryId,
            competitionId,
          }),
        })
        await tx.competitionEntry.update({
          where: { id: body.competitionEntryId },
          data: { paymentId: created.id },
        })
        return created
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
          purpose: 'booking',
        },
      })
    })
    await syncPaymentToParent(payment.id)
    await syncCompetitionEntryOnPayment(payment.id)
    await creditOwnerForPaidPayment(payment.id, previousStatus)
    await notifyPaymentPaidIfNeeded(payment.id, previousStatus)
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
    if (!body.competitionEntryId) {
      await prisma.payment.delete({ where: { id: existingPayment.id } })
      existingPayment = null
      amount = payableAmount
    }
    // Competition checkout keeps the join-linked payment and refreshes intent in place.
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
  const idempotencyKey = body.competitionEntryId && competitionId
    ? competitionJoinIdempotencyKey(competitionId, user.id, body.competitionEntryId)
    : randomBytes(16).toString('hex')

  const session = await service.createIntent({
    amount: payableAmount,
    bookingId: body.bookingId,
    coachSessionId: body.coachSessionId,
    packageBookingId: body.packageBookingId,
    competitionEntryId: body.competitionEntryId,
    userId: body.competitionEntryId ? user.id : undefined,
    purpose: body.competitionEntryId ? 'competition' : undefined,
    idempotencyKey,
    existingPaymentId: body.competitionEntryId && existingPayment
      ? existingPayment.id
      : undefined,
  })

  if (body.competitionEntryId) {
    await prisma.competitionEntry.update({
      where: { id: body.competitionEntryId },
      data: { paymentId: session.paymentId },
    })
  }

  await syncPaymentToParent(session.paymentId)
  await syncCompetitionEntryOnPayment(session.paymentId)
  return session
})
