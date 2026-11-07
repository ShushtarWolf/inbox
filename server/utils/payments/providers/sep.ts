import { randomBytes } from 'node:crypto'
import { paymentIntentMetadata } from '#shared/financeDiscount.ts'
import type { PaymentConfirmOptions, PaymentService } from '#shared/payments.ts'
import { getPaymentsMode, PAYMENT_CURRENCY, tomanToRials } from '#shared/payments.ts'
import { siteUrl } from '../../email'
import { shouldPreserveUnsettledCapture } from '#shared/paymentInFlight.ts'
import { confirmSepPayment } from '../../sepConfirm'
import { prisma } from '../../prisma'
import { registerPaymentProvider, toPaymentIntent } from '../registry'
import {
  isSepSimulatedRef,
  sepRequestToken,
  sepReverseTransaction,
  sepStartPayUrl,
} from '../sepClient'

function terminalId(): string | undefined {
  const id = process.env.SEP_TERMINAL_ID?.trim()
  return id || undefined
}

function callbackUrl(): string {
  return `${siteUrl().replace(/\/$/, '')}/payments/callback/sep`
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

const REFRESHABLE_INTENT_STATUSES = ['PENDING_ONLINE', 'PAY_AT_CLUB', 'PENDING_AT_CLUB', 'FAILED'] as const

/** In-place intent refresh must not knock a settled or in-flight capture back to pending. */
async function replacePayableIntent(
  id: string,
  data: {
    amount: number
    method: 'IPG'
    status: 'PENDING_ONLINE'
    provider: 'sep'
    providerRef: string
    idempotencyKey: string
    purpose: string
    userId?: string
    metadataJson: string
  },
) {
  const current = await prisma.payment.findUnique({ where: { id } })
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Payment not found' })
  if (current.status === 'PAID' || current.status === 'REFUNDED' || current.status === 'SUPERSEDED') {
    return current
  }
  const meta = parseMetadata(current.metadataJson)
  if (shouldPreserveUnsettledCapture(current) && meta.gatewayReversed !== true) {
    throw createError({ statusCode: 409, statusMessage: 'PAYMENT_VERIFY_PENDING' })
  }
  const claimed = await prisma.payment.updateMany({
    where: { id, status: { in: [...REFRESHABLE_INTENT_STATUSES] } },
    data: { ...data, gatewayRef: null },
  })
  return prisma.payment.findUniqueOrThrow({ where: { id: claimed.count === 1 ? id : current.id } })
}

/**
 * Real SEP (Saman) adapter.
 * - live: requires SEP_TERMINAL_ID; verify before PAID; never fakes success
 * - test + terminal: real SEP request/verify against production host (SEP has no public sandbox)
 * - test without terminal: local simulate gateway (no secrets) → callback → confirm
 */
export function sepProvider(): PaymentService {
  const provider: PaymentService = {
    name: 'sep',
    async createIntent(input) {
      const mode = getPaymentsMode()
      if (mode === 'pay_at_club') {
        throw createError({ statusCode: 400, statusMessage: 'Online checkout is disabled; pay at the club or use wallet balance' })
      }

      const tid = terminalId()
      if (mode === 'live' && !tid) {
        throw createError({ statusCode: 501, statusMessage: 'SEP not configured (SEP_TERMINAL_ID)' })
      }

      // Local/CI without secrets: simulated ResNum + in-app test gateway.
      if (!tid) {
        const providerRef = `SIM${randomBytes(12).toString('hex')}`
        const purpose = input.purpose === 'topup'
          ? 'topup'
          : input.purpose === 'competition'
            ? 'competition'
            : 'booking'
        const metadataJson = paymentIntentMetadata({
          simulated: true,
          purpose,
          competitionEntryId: input.competitionEntryId,
        }, input.preservedMetadata)
        const payment = input.existingPaymentId
          ? await replacePayableIntent(input.existingPaymentId, {
              amount: input.amount,
              method: 'IPG',
              status: 'PENDING_ONLINE',
              provider: 'sep',
              providerRef,
              idempotencyKey: input.idempotencyKey,
              purpose,
              userId: purpose === 'topup' || purpose === 'competition' ? input.userId : undefined,
              metadataJson,
            })
          : await prisma.payment.create({
              data: {
                amount: input.amount,
                method: 'IPG',
                status: 'PENDING_ONLINE',
                provider: 'sep',
                providerRef,
                idempotencyKey: input.idempotencyKey,
                purpose,
                userId: purpose === 'topup' || purpose === 'competition' ? input.userId : undefined,
                bookingId: input.bookingId,
                coachSessionId: input.coachSessionId,
                packageBookingId: input.packageBookingId,
                metadataJson,
              },
            })
        const redirectUrl = payment.status === 'PENDING_ONLINE'
          ? `/payments/test-gateway?provider=sep&ResNum=${encodeURIComponent(payment.providerRef || providerRef)}&amount=${payment.amount}`
          : undefined
        return {
          paymentId: payment.id,
          mode: 'test',
          intent: {
            id: payment.id,
            amount: payment.amount,
            currency: PAYMENT_CURRENCY,
            status: payment.status === 'PAID' || payment.status === 'REFUNDED' || payment.status === 'FAILED'
            ? payment.status
            : 'PENDING_ONLINE',
            provider: 'sep',
            providerRef: payment.providerRef || providerRef,
            redirectUrl,
          },
        }
      }

      // ResNum must be unique per attempt; use our payment id after create is not possible
      // before token — generate a stable merchant reference first.
      const resNum = `INB${randomBytes(10).toString('hex')}`
      const purpose = input.purpose === 'topup'
        ? 'topup'
        : input.purpose === 'competition'
          ? 'competition'
          : 'booking'

      if (input.existingPaymentId) {
        const current = await prisma.payment.findUnique({ where: { id: input.existingPaymentId } })
        if (current?.status === 'SUPERSEDED') {
          throw createError({ statusCode: 409, statusMessage: 'PAYMENT_NOT_PAYABLE' })
        }
        if (current && (current.status === 'PAID' || current.status === 'REFUNDED')) {
          return {
            paymentId: current.id,
            mode,
            intent: {
              id: current.id,
              amount: current.amount,
              currency: PAYMENT_CURRENCY,
              status: current.status,
              provider: 'sep',
              providerRef: current.providerRef || undefined,
            },
          }
        }
        if (current && shouldPreserveUnsettledCapture(current) && parseMetadata(current.metadataJson).gatewayReversed !== true) {
          throw createError({ statusCode: 409, statusMessage: 'PAYMENT_VERIFY_PENDING' })
        }
      }

      const requested = await sepRequestToken({
        terminalId: tid,
        amount: tomanToRials(input.amount),
        resNum,
        redirectUrl: callbackUrl(),
      })

      const liveMeta = paymentIntentMetadata({
        token: requested.token,
        sepStatus: requested.status,
        purpose,
        competitionEntryId: input.competitionEntryId,
      }, input.preservedMetadata)
      const payment = input.existingPaymentId
        ? await replacePayableIntent(input.existingPaymentId, {
            amount: input.amount,
            method: 'IPG',
            status: 'PENDING_ONLINE',
            provider: 'sep',
            providerRef: resNum,
            idempotencyKey: input.idempotencyKey,
            purpose,
            userId: purpose === 'topup' || purpose === 'competition' ? input.userId : undefined,
            metadataJson: liveMeta,
          })
        : await prisma.payment.create({
            data: {
              amount: input.amount,
              method: 'IPG',
              status: 'PENDING_ONLINE',
              provider: 'sep',
              providerRef: resNum,
              idempotencyKey: input.idempotencyKey,
              purpose,
              userId: purpose === 'topup' || purpose === 'competition' ? input.userId : undefined,
              bookingId: input.bookingId,
              coachSessionId: input.coachSessionId,
              packageBookingId: input.packageBookingId,
              metadataJson: liveMeta,
            },
          })

      return {
        paymentId: payment.id,
        mode,
        intent: {
          id: payment.id,
          amount: payment.amount,
          currency: PAYMENT_CURRENCY,
          status: payment.status === 'PAID' || payment.status === 'REFUNDED' || payment.status === 'FAILED'
            ? payment.status
            : 'PENDING_ONLINE',
          provider: 'sep',
          providerRef: payment.providerRef || resNum,
          // Client converts SendToken GET → POST OnlinePG + Token (see paymentRedirect).
          redirectUrl: payment.status === 'PENDING_ONLINE' ? sepStartPayUrl(requested.token) : undefined,
        },
      }
    },

    async confirm(providerRef, opts?: PaymentConfirmOptions) {
      return confirmSepPayment(providerRef, opts)
    },

    async refund(paymentId) {
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
      if (payment.provider !== 'sep') {
        throw createError({ statusCode: 400, statusMessage: 'Not a SEP payment' })
      }

      const meta = parseMetadata(payment.metadataJson)
      const simulated = Boolean(meta.simulated)
        || (payment.providerRef ? isSepSimulatedRef(payment.providerRef) : false)

      if (simulated || getPaymentsMode() !== 'live') {
        const updated = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'REFUNDED',
            metadataJson: JSON.stringify({ ...meta, refundedAt: new Date().toISOString(), simulatedRefund: true }),
          },
        })
        return toPaymentIntent(updated)
      }

      const tid = terminalId()
      const refNum = meta.refNum != null ? String(meta.refNum) : ''
      if (!tid || !refNum) {
        throw createError({
          statusCode: 501,
          statusMessage: 'SEP live refund requires SEP_TERMINAL_ID + stored RefNum',
        })
      }

      await sepReverseTransaction({ terminalId: tid, refNum })

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REFUNDED',
          metadataJson: JSON.stringify({ ...meta, refundedAt: new Date().toISOString(), gatewayRefund: true }),
        },
      })
      return toPaymentIntent(updated)
    },

    async getStatus(paymentId) {
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
      return toPaymentIntent(payment)
    },

    // SEP has no HMAC webhook in this integration — browser callback + verifyTransaction only.
    verifyWebhook(_payload: unknown) {
      return false
    },
  }
  registerPaymentProvider(provider)
  return provider
}
