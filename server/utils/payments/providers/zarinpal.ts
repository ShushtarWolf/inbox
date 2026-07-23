import { randomBytes } from 'node:crypto'
import type { PaymentService } from '#shared/payments.ts'
import { getPaymentsMode, PAYMENT_CURRENCY } from '#shared/payments.ts'
import { siteUrl } from '../../email'
import { registerPaymentProvider, toPaymentIntent } from '../registry'
import {
  isZarinpalSimulatedAuthority,
  isZarinpalVerifySuccess,
  zarinpalRefundPayment,
  zarinpalRequestPayment,
  zarinpalStartPayUrl,
  zarinpalVerifyPayment,
  type ZarinpalApiMode,
} from '../zarinpalClient'

function apiMode(): ZarinpalApiMode {
  return getPaymentsMode() === 'live' ? 'live' : 'sandbox'
}

function merchantId(): string | undefined {
  const id = process.env.ZARINPAL_MERCHANT_ID?.trim()
  return id || undefined
}

function accessToken(): string | undefined {
  const token = process.env.ZARINPAL_ACCESS_TOKEN?.trim()
  return token || undefined
}

function callbackUrl(): string {
  return `${siteUrl().replace(/\/$/, '')}/payments/callback/zarinpal`
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
 * Real Zarinpal adapter.
 * - live: requires ZARINPAL_MERCHANT_ID; verify before PAID; never fakes success
 * - test + merchant: sandbox.zarinpal.com request/verify
 * - test without merchant: local simulate gateway (no secrets) → callback → confirm
 */
export function zarinpalProvider(): PaymentService {
  const provider: PaymentService = {
    name: 'zarinpal',
    async createIntent(input) {
      const mode = getPaymentsMode()
      if (mode === 'pay_at_club') {
        throw createError({ statusCode: 400, statusMessage: 'Online checkout is disabled; pay at the club or use wallet balance' })
      }

      const mid = merchantId()
      if (mode === 'live' && !mid) {
        throw createError({ statusCode: 501, statusMessage: 'Zarinpal not configured (ZARINPAL_MERCHANT_ID)' })
      }

      // Local/CI without secrets: simulated authority + in-app test gateway.
      if (!mid) {
        const providerRef = `SIM${randomBytes(12).toString('hex')}`
        const payment = await prisma.payment.create({
          data: {
            amount: input.amount,
            method: 'IPG',
            status: 'PENDING_ONLINE',
            provider: 'zarinpal',
            providerRef,
            idempotencyKey: input.idempotencyKey,
            bookingId: input.bookingId,
            coachSessionId: input.coachSessionId,
            packageBookingId: input.packageBookingId,
            metadataJson: JSON.stringify({ simulated: true }),
          },
        })
        const redirectUrl = `${siteUrl().replace(/\/$/, '')}/payments/test-gateway?provider=zarinpal&Authority=${encodeURIComponent(providerRef)}&amount=${payment.amount}`
        return {
          paymentId: payment.id,
          mode: 'test',
          intent: {
            id: payment.id,
            amount: payment.amount,
            currency: PAYMENT_CURRENCY,
            status: 'PENDING_ONLINE',
            provider: 'zarinpal',
            providerRef,
            redirectUrl,
          },
        }
      }

      const requested = await zarinpalRequestPayment(apiMode(), {
        merchantId: mid,
        amount: input.amount,
        callbackUrl: callbackUrl(),
        description: input.bookingId
          ? `Court booking ${input.bookingId}`
          : input.coachSessionId
            ? `Coach session ${input.coachSessionId}`
            : input.packageBookingId
              ? `Package ${input.packageBookingId}`
              : 'inbox payment',
      })

      const payment = await prisma.payment.create({
        data: {
          amount: input.amount,
          method: 'IPG',
          status: 'PENDING_ONLINE',
          provider: 'zarinpal',
          providerRef: requested.authority,
          idempotencyKey: input.idempotencyKey,
          bookingId: input.bookingId,
          coachSessionId: input.coachSessionId,
          packageBookingId: input.packageBookingId,
          metadataJson: JSON.stringify({ zarinpalCode: requested.code, apiMode: apiMode() }),
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
          provider: 'zarinpal',
          providerRef: requested.authority,
          redirectUrl: zarinpalStartPayUrl(requested.authority, apiMode()),
        },
      }
    },

    async confirm(providerRef) {
      const payment = await prisma.payment.findFirst({
        where: { provider: 'zarinpal', providerRef },
      })
      if (!payment) throw createError({ statusCode: 404, statusMessage: 'Payment not found' })

      // Idempotent: already settled
      if (payment.status === 'PAID' || payment.status === 'REFUNDED') {
        return toPaymentIntent(payment)
      }

      const meta = parseMetadata(payment.metadataJson)
      const simulated = Boolean(meta.simulated) || isZarinpalSimulatedAuthority(providerRef)

      if (simulated) {
        if (getPaymentsMode() === 'live') {
          throw createError({ statusCode: 501, statusMessage: 'Simulated Zarinpal confirm blocked in live mode' })
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

      const mid = merchantId()
      if (!mid) {
        throw createError({ statusCode: 501, statusMessage: 'Zarinpal not configured (ZARINPAL_MERCHANT_ID)' })
      }

      const verified = await zarinpalVerifyPayment(apiMode(), {
        merchantId: mid,
        amount: payment.amount,
        authority: providerRef,
      })

      if (!isZarinpalVerifySuccess(verified.code)) {
        const failed = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            metadataJson: JSON.stringify({
              ...meta,
              verifyCode: verified.code,
              verifyMessage: verified.message,
            }),
          },
        })
        throw createError({
          statusCode: 402,
          statusMessage: `Zarinpal verify failed (code=${verified.code})`,
          data: { paymentId: failed.id, code: verified.code },
        })
      }

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          method: 'IPG',
          metadataJson: JSON.stringify({
            ...meta,
            verifyCode: verified.code,
            refId: verified.refId,
            cardPan: verified.cardPan,
            confirmedAt: new Date().toISOString(),
          }),
        },
      })
      return toPaymentIntent(updated)
    },

    async refund(paymentId) {
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
      if (payment.provider !== 'zarinpal') {
        throw createError({ statusCode: 400, statusMessage: 'Not a Zarinpal payment' })
      }

      const meta = parseMetadata(payment.metadataJson)
      const simulated = Boolean(meta.simulated)
        || (payment.providerRef ? isZarinpalSimulatedAuthority(payment.providerRef) : false)

      if (simulated || getPaymentsMode() !== 'live') {
        // Test/simulate: mark refunded locally (no real money moved).
        const updated = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'REFUNDED',
            metadataJson: JSON.stringify({ ...meta, refundedAt: new Date().toISOString(), simulatedRefund: true }),
          },
        })
        return toPaymentIntent(updated)
      }

      const mid = merchantId()
      const token = accessToken()
      if (!mid || !token || !payment.providerRef) {
        throw createError({
          statusCode: 501,
          statusMessage: 'Zarinpal live refund requires ZARINPAL_MERCHANT_ID + ZARINPAL_ACCESS_TOKEN',
        })
      }

      await zarinpalRefundPayment(apiMode(), {
        merchantId: mid,
        authority: payment.providerRef,
        accessToken: token,
      })

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
