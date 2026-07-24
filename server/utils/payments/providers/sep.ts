import { randomBytes } from 'node:crypto'
import type { PaymentConfirmOptions, PaymentService } from '#shared/payments.ts'
import { getPaymentsMode, PAYMENT_CURRENCY } from '#shared/payments.ts'
import { siteUrl } from '../../email'
import { registerPaymentProvider, toPaymentIntent } from '../registry'
import {
  isSepSimulatedRef,
  isSepVerifySuccess,
  sepRequestToken,
  sepReverseTransaction,
  sepStartPayUrl,
  sepVerifyTransaction,
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
        const payment = await prisma.payment.create({
          data: {
            amount: input.amount,
            method: 'IPG',
            status: 'PENDING_ONLINE',
            provider: 'sep',
            providerRef,
            idempotencyKey: input.idempotencyKey,
            bookingId: input.bookingId,
            coachSessionId: input.coachSessionId,
            packageBookingId: input.packageBookingId,
            metadataJson: JSON.stringify({ simulated: true }),
          },
        })
        const redirectUrl = `${siteUrl().replace(/\/$/, '')}/payments/test-gateway?provider=sep&ResNum=${encodeURIComponent(providerRef)}&amount=${payment.amount}`
        return {
          paymentId: payment.id,
          mode: 'test',
          intent: {
            id: payment.id,
            amount: payment.amount,
            currency: PAYMENT_CURRENCY,
            status: 'PENDING_ONLINE',
            provider: 'sep',
            providerRef,
            redirectUrl,
          },
        }
      }

      // ResNum must be unique per attempt; use our payment id after create is not possible
      // before token — generate a stable merchant reference first.
      const resNum = `INB${randomBytes(10).toString('hex')}`

      const requested = await sepRequestToken({
        terminalId: tid,
        amount: input.amount,
        resNum,
        redirectUrl: callbackUrl(),
      })

      const payment = await prisma.payment.create({
        data: {
          amount: input.amount,
          method: 'IPG',
          status: 'PENDING_ONLINE',
          provider: 'sep',
          providerRef: resNum,
          idempotencyKey: input.idempotencyKey,
          bookingId: input.bookingId,
          coachSessionId: input.coachSessionId,
          packageBookingId: input.packageBookingId,
          metadataJson: JSON.stringify({
            token: requested.token,
            sepStatus: requested.status,
          }),
        },
      })

      return {
        paymentId: payment.id,
        mode,
        intent: {
          id: payment.id,
          amount: payment.amount,
          currency: PAYMENT_CURRENCY,
          status: 'PENDING_ONLINE',
          provider: 'sep',
          providerRef: resNum,
          redirectUrl: sepStartPayUrl(requested.token),
        },
      }
    },

    async confirm(providerRef, opts?: PaymentConfirmOptions) {
      const payment = await prisma.payment.findFirst({
        where: { provider: 'sep', providerRef },
      })
      if (!payment) throw createError({ statusCode: 404, statusMessage: 'Payment not found' })

      if (payment.status === 'PAID' || payment.status === 'REFUNDED') {
        return toPaymentIntent(payment)
      }

      const meta = parseMetadata(payment.metadataJson)
      const simulated = Boolean(meta.simulated) || isSepSimulatedRef(providerRef)

      if (simulated) {
        if (getPaymentsMode() === 'live') {
          throw createError({ statusCode: 501, statusMessage: 'Simulated SEP confirm blocked in live mode' })
        }
        const updated = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            method: 'IPG',
            metadataJson: JSON.stringify({ ...meta, confirmedAt: new Date().toISOString(), simulated: true }),
          },
        })
        return toPaymentIntent(updated)
      }

      const tid = terminalId()
      if (!tid) {
        throw createError({ statusCode: 501, statusMessage: 'SEP not configured (SEP_TERMINAL_ID)' })
      }

      const refNum = String(opts?.refNum || meta.refNum || '').trim()
      if (!refNum) {
        throw createError({ statusCode: 400, statusMessage: 'SEP confirm requires RefNum from callback' })
      }

      const verified = await sepVerifyTransaction({
        terminalId: tid,
        refNum,
      })

      if (!isSepVerifySuccess(verified.resultCode)) {
        const failed = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            metadataJson: JSON.stringify({
              ...meta,
              refNum,
              verifyCode: verified.resultCode,
              verifyMessage: verified.resultDescription,
            }),
          },
        })
        throw createError({
          statusCode: 402,
          statusMessage: `SEP verify failed (code=${verified.resultCode})`,
          data: { paymentId: failed.id, code: verified.resultCode },
        })
      }

      if (verified.amount != null && verified.amount !== payment.amount) {
        const failed = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            metadataJson: JSON.stringify({
              ...meta,
              refNum,
              verifyCode: verified.resultCode,
              amountMismatch: { expected: payment.amount, got: verified.amount },
            }),
          },
        })
        throw createError({
          statusCode: 402,
          statusMessage: 'SEP verify amount mismatch',
          data: { paymentId: failed.id },
        })
      }

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          method: 'IPG',
          metadataJson: JSON.stringify({
            ...meta,
            refNum,
            verifyCode: verified.resultCode,
            maskedPan: verified.maskedPan,
            traceNo: verified.traceNo,
            confirmedAt: new Date().toISOString(),
          }),
        },
      })
      return toPaymentIntent(updated)
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

    verifyWebhook(payload: unknown) {
      return Boolean(payload && typeof payload === 'object')
    },
  }
  registerPaymentProvider(provider)
  return provider
}
