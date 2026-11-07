import { randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { computeBookingPrice, computeListedSlotPrice } from '#shared/courtPricing.ts'
import {
  financeIncomeAmount,
  isOnlinePaymentsEnabled,
  isPaymentPayableOnline,
} from '#shared/bookingPayment.ts'
import {
  buildCompetitionWalletPaymentCreateData,
  competitionJoinIdempotencyKey,
} from '#shared/competition.ts'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { checkoutPreservedMetadata } from '#shared/financeDiscount.ts'
import { getPaymentsMode, PAYMENT_CURRENCY, type PaymentProvider } from '#shared/payments.ts'
import { canCoverBookingWithWallet } from '#shared/walletTopUp.ts'
import { normalizeUseWallet, readSplitPayMeta, splitPayParts } from '#shared/splitPay.ts'
import { signReceiptToken } from '#shared/receiptToken.ts'
import { getPaymentService } from '../../utils/payments/service'
import {
  assertOnlineHoldPayable,
  releaseExpiredOnlinePaymentHolds,
} from '../../utils/onlinePaymentHold'
import { notifyPaymentPaidIfNeeded, syncCompetitionEntryOnPayment, syncPaymentToParent } from '../../utils/paymentSync'
import { receiptSigningSecret } from '../../utils/receipt'
import { enqueueMoneyJobsForPaidPayment } from '../../utils/moneyJobs'
import { linkPaymentSupersededBy, supersedePayablePaymentForRetry, type SupersedeResult } from '../../utils/paymentSupersede'
import { releaseSplitWalletDebit } from '../../utils/splitPayWallet'
import { creditOwnerForPaidPayment } from '../../utils/settlement'
import { debitWallet, getWalletBalance } from '../../utils/wallet'

async function supersedeForCheckout(
  paymentId: string,
  payment: { providerRef?: string | null, metadataJson: string | null },
): Promise<{ keep?: { id: string, amount: number, status: string, provider: string, providerRef: string | null }, replacedId: string | null }> {
  let result: SupersedeResult
  try {
    result = await supersedePayablePaymentForRetry(payment)
  } catch {
    const fresh = await prisma.payment.findUnique({ where: { id: paymentId }, select: { status: true } })
    result = { superseded: false, status: fresh?.status || 'UNKNOWN' }
  }
  if (!result.superseded && (result.status === 'PAID' || result.status === 'REFUNDED')) {
    const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
    return {
      keep: {
        id: fresh.id,
        amount: fresh.amount,
        status: fresh.status,
        provider: fresh.provider,
        providerRef: fresh.providerRef,
      },
      replacedId: null,
    }
  }
  if (!result.superseded && result.status !== 'SUPERSEDED') {
    throw createError({ statusCode: 409, statusMessage: 'PAYMENT_VERIFY_PENDING' })
  }
  return { replacedId: result.superseded ? paymentId : null }
}

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    bookingId?: string
    coachSessionId?: string
    packageBookingId?: string
    competitionEntryId?: string
    useWallet?: boolean | 'full' | 'partial'
  }>(event)
  const useWalletMode = normalizeUseWallet(body.useWallet)
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
    metadataJson: string | null
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
    // A failed retry can leave the entry pointing at a SUPERSEDED row — start a fresh payable.
    if (entry.payment && entry.payment.status !== 'SUPERSEDED') existingPayment = entry.payment
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
  // Use financeIncomeAmount (not `||`) so sibling/comp amount 0 is not replaced by list price.
  const payableAmount = financeIncomeAmount(existingPayment, amount)
  if (payableAmount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid amount' })
  }

  if (useWalletMode === 'full' && payableAmount > 0) {
    const balance = await getWalletBalance(user.id)
    if (!canCoverBookingWithWallet(balance, payableAmount)) {
      throw createError({ statusCode: 409, statusMessage: 'Insufficient wallet balance' })
    }
    const previousStatus = existingPayment?.status || ''
    const debitNote = body.competitionEntryId
      ? 'Competition entry payment from wallet'
      : 'Booking payment from wallet'
    const { payment, claimedNow } = await prisma.$transaction(async (tx) => {
      // Claim unpaid → PAID first so a parallel wallet pay cannot double-debit.
      if (existingPayment) {
        const claimed = await tx.payment.updateMany({
          where: {
            id: existingPayment.id,
            status: { notIn: ['PAID', 'REFUNDED'] },
          },
          data: { status: 'PAID', method: 'PAID', provider: 'pay_at_club' },
        })
        if (claimed.count !== 1) {
          return {
            payment: await tx.payment.findUniqueOrThrow({ where: { id: existingPayment.id } }),
            claimedNow: false,
          }
        }
        await debitWallet(user.id, payableAmount, {
          type: 'PAYMENT_DEBIT',
          paymentId: existingPayment.id,
          bookingId: body.bookingId,
          note: debitNote,
        }, tx)
        return {
          payment: await tx.payment.findUniqueOrThrow({ where: { id: existingPayment.id } }),
          claimedNow: true,
        }
      }

      if (body.competitionEntryId && competitionId) {
        const idempotencyKey = competitionJoinIdempotencyKey(
          competitionId,
          user.id,
          body.competitionEntryId,
        )
        let created
        try {
          created = await tx.payment.create({
            data: {
              ...buildCompetitionWalletPaymentCreateData({
                amount: payableAmount,
                userId: user.id,
                competitionEntryId: body.competitionEntryId,
                competitionId,
              }),
              idempotencyKey,
            },
          })
        }
        catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const existing = await tx.payment.findUnique({ where: { idempotencyKey } })
            if (existing?.status === 'PAID') {
              // Idempotent debit recovers a rare create-without-debit; no-op if already debited.
              await debitWallet(user.id, payableAmount, {
                type: 'PAYMENT_DEBIT',
                paymentId: existing.id,
                note: debitNote,
              }, tx)
              return { payment: existing, claimedNow: false }
            }
          }
          throw error
        }
        await debitWallet(user.id, payableAmount, {
          type: 'PAYMENT_DEBIT',
          paymentId: created.id,
          note: debitNote,
        }, tx)
        await tx.competitionEntry.update({
          where: { id: body.competitionEntryId },
          data: { paymentId: created.id },
        })
        return { payment: created, claimedNow: true }
      }

      const created = await tx.payment.create({
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
      await debitWallet(user.id, payableAmount, {
        type: 'PAYMENT_DEBIT',
        paymentId: created.id,
        bookingId: body.bookingId,
        note: debitNote,
      }, tx)
      return { payment: created, claimedNow: true }
    })
    await syncPaymentToParent(payment.id)
    await syncCompetitionEntryOnPayment(payment.id)
    await enqueueMoneyJobsForPaidPayment(payment.id)
    // Concurrent loser: claim skipped — settle is idempotent; skip duplicate paid SMS.
    await creditOwnerForPaidPayment(payment.id, claimedNow ? previousStatus : 'PAID')
    const { markMoneyJobsDoneForPaidPayment } = await import('../../utils/moneyJobs')
    await markMoneyJobsDoneForPaidPayment(payment.id)
    if (claimedNow) await notifyPaymentPaidIfNeeded(payment.id, previousStatus)
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
      statusMessage: 'ONLINE_PAYMENTS_REQUIRED',
    })
  }

  // Keep discount + multi-day/season sibling links across IPG payment replace.
  const preservedMetadata = checkoutPreservedMetadata(existingPayment?.metadataJson)
  // Court / season IPG return should open the public receipt, same as /r/:token checkout.
  if (body.bookingId) {
    preservedMetadata.receiptToken = signReceiptToken(body.bookingId, receiptSigningSecret())
  }
  let supersededPaymentId: string | null = null
  if (existingPayment && isPaymentPayableOnline(existingPayment.status)) {
    // Competition checkout keeps the join-linked payment and refreshes intent in place —
    // except split-pay, whose wallet rail must be released on a fresh row (in-place refresh drops split meta).
    const existingIsSplit = Boolean(readSplitPayMeta(parsePaymentMetadata(existingPayment.metadataJson)))
    if (!body.competitionEntryId || useWalletMode === 'partial' || existingIsSplit) {
      const superseded = await supersedeForCheckout(existingPayment.id, existingPayment)
      if (superseded.keep) {
        return {
          paymentId: superseded.keep.id,
          mode: getPaymentsMode(),
          intent: {
            id: superseded.keep.id,
            amount: superseded.keep.amount,
            currency: PAYMENT_CURRENCY,
            status: superseded.keep.status,
            provider: superseded.keep.provider as PaymentProvider,
            providerRef: superseded.keep.providerRef || undefined,
          },
        }
      }
      supersededPaymentId = superseded.replacedId
      existingPayment = null
      amount = payableAmount
    }
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

  let ipgAmount = payableAmount
  if (useWalletMode === 'partial' && payableAmount > 0) {
    const balance = await getWalletBalance(user.id)
    const { walletPart, ipgPart } = splitPayParts(balance, payableAmount)
    if (walletPart <= 0 || ipgPart <= 0) {
      throw createError({
        statusCode: 409,
        statusMessage: walletPart <= 0
          ? 'Insufficient wallet balance'
          : 'Wallet covers full amount — use full wallet checkout',
      })
    }
    ipgAmount = ipgPart
    preservedMetadata.splitPay = true
    preservedMetadata.walletDebitAmount = walletPart
    preservedMetadata.ipgChargeAmount = ipgPart
    preservedMetadata.splitFullAmount = payableAmount
    preservedMetadata.walletUserId = user.id
  }

  const service = getPaymentService()
  // A superseded competition row still holds the join key (unique) — the replacement needs its own.
  const idempotencyKey = body.competitionEntryId && competitionId && !supersededPaymentId
    ? competitionJoinIdempotencyKey(competitionId, user.id, body.competitionEntryId)
    : randomBytes(16).toString('hex')

  let session
  if (useWalletMode === 'partial') {
    const walletPart = Math.floor(Number(preservedMetadata.walletDebitAmount) || 0)
    const pendingPaymentId = await prisma.$transaction(async (tx) => {
      const row = await tx.payment.create({
        data: {
          amount: ipgAmount,
          method: 'IPG',
          status: 'PENDING_ONLINE',
          provider: 'sep',
          idempotencyKey,
          purpose: body.competitionEntryId ? 'competition' : 'booking',
          userId: user.id,
          bookingId: body.bookingId,
          coachSessionId: body.coachSessionId,
          packageBookingId: body.packageBookingId,
          metadataJson: JSON.stringify(preservedMetadata),
        },
      })
      await debitWallet(user.id, walletPart, {
        type: 'PAYMENT_DEBIT',
        paymentId: row.id,
        bookingId: body.bookingId,
        note: 'Split pay wallet portion',
      }, tx)
      if (body.competitionEntryId) {
        await tx.competitionEntry.update({
          where: { id: body.competitionEntryId },
          data: { paymentId: row.id },
        })
      }
      return row.id
    })

    try {
      session = await service.createIntent({
        amount: ipgAmount,
        bookingId: body.bookingId,
        coachSessionId: body.coachSessionId,
        packageBookingId: body.packageBookingId,
        competitionEntryId: body.competitionEntryId,
        userId: user.id,
        purpose: body.competitionEntryId ? 'competition' : undefined,
        idempotencyKey,
        existingPaymentId: pendingPaymentId,
        preservedMetadata: Object.keys(preservedMetadata).length ? preservedMetadata : undefined,
      })
    }
    catch (err) {
      await releaseSplitWalletDebit(pendingPaymentId)
      await prisma.payment.update({
        where: { id: pendingPaymentId },
        data: { status: 'FAILED' },
      }).catch(() => {})
      throw err
    }
  }
  else {
    session = await service.createIntent({
      amount: ipgAmount,
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
      preservedMetadata: Object.keys(preservedMetadata).length ? preservedMetadata : undefined,
    })
  }

  if (supersededPaymentId && session.paymentId) {
    await linkPaymentSupersededBy(supersededPaymentId, session.paymentId)
  }

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
