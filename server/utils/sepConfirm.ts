import { Prisma } from '@prisma/client'
import { createError } from 'h3'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { paymentFailureData } from '#shared/paymentFailure.ts'
import { readSplitPayMeta } from '#shared/splitPay.ts'
import { bindSepVerify, isSepVerifyTransportError } from '#shared/sepVerifyBind.ts'
import { getPaymentsMode, tomanToRials, type PaymentConfirmOptions } from '#shared/payments.ts'
import { toPaymentIntent } from './payments/registry'
import {
  isSepSimulatedRef,
  sepReverseTransaction,
  sepVerifyTransaction,
} from './payments/sepClient'
import { claimPaymentPaid } from './paymentClaim'
import { prisma } from './prisma'
import { SplitRecollectError, recollectReleasedSplitWallet } from './splitPayWallet'

const PAYABLE = ['PENDING_ONLINE', 'FAILED'] as const

type PaymentRow = Awaited<ReturnType<typeof prisma.payment.findFirst>> & object

function fail(definitive: boolean, code: string, statusCode: number, message: string): never {
  throw createError({
    statusCode,
    statusMessage: message,
    data: paymentFailureData(definitive, code),
  })
}

function terminalId(): string | undefined {
  const id = process.env.SEP_TERMINAL_ID?.trim()
  return id || undefined
}

function metaOf(raw: string | null | undefined): Record<string, unknown> {
  return parsePaymentMetadata(raw)
}

function storedRials(meta: Record<string, unknown>): number | null {
  const n = Number(meta.verifiedAmountRials)
  return Number.isFinite(n) && n > 0 ? n : null
}

async function lockPayment(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${id} FOR UPDATE`
  return tx.payment.findUniqueOrThrow({ where: { id } })
}

function isTerminal(status: string) {
  return status === 'PAID' || status === 'REFUNDED' || status === 'SUPERSEDED'
}

/**
 * Bind a SEP (or simulated) callback to this payment and claim PAID.
 * Repeated callbacks for the same capture are idempotent. A RefNum that verifies
 * as a different ResNum is ignored. Transport errors leave the row payable.
 */
export async function confirmSepPayment(providerRef: string, opts?: PaymentConfirmOptions) {
  const payment = await prisma.payment.findFirst({
    where: { provider: 'sep', providerRef },
  })
  if (!payment) fail(false, 'NOT_FOUND', 404, 'Payment not found')

  if (payment.status === 'PAID') return toPaymentIntent(payment)
  if (payment.status === 'REFUNDED' || payment.status === 'SUPERSEDED') {
    fail(false, 'PAYMENT_NOT_PAYABLE', 409, 'Payment is not payable')
  }

  const meta = metaOf(payment.metadataJson)
  const simulated = Boolean(meta.simulated) || isSepSimulatedRef(providerRef)
  if (simulated) {
    if (getPaymentsMode() === 'live') {
      fail(false, 'SIMULATED_BLOCKED', 501, 'Simulated SEP confirm blocked in live mode')
    }
    return finishPaid(payment, {
      ...meta,
      simulated: true,
      confirmedAt: new Date().toISOString(),
    }, null)
  }

  const tid = terminalId()
  if (!tid) fail(false, 'SEP_NOT_CONFIGURED', 501, 'SEP not configured (SEP_TERMINAL_ID)')

  const refNum = String(opts?.refNum || meta.refNum || meta.verifyPendingRefNum || '').trim()
  if (!refNum) fail(false, 'MISSING_REFNUM', 400, 'SEP confirm requires RefNum from callback')

  let verified: Awaited<ReturnType<typeof sepVerifyTransaction>>
  try {
    verified = await sepVerifyTransaction({ terminalId: tid, refNum })
  } catch (err) {
    if (isSepVerifyTransportError(err)) {
      await rememberPendingRef(payment.id, meta, refNum)
      fail(false, 'SEP_VERIFY_AMBIGUOUS', 503, 'SEP verify incomplete; retry the callback')
    }
    throw err
  }

  const expectedRials = tomanToRials(payment.amount)
  const decision = bindSepVerify({
    resultCode: verified.resultCode,
    resNum: verified.resNum,
    amountRials: verified.amount ?? null,
    expectedResNum: payment.providerRef || providerRef,
    expectedRials,
    expectedToman: payment.amount,
    refNum,
    storedGatewayRef: payment.gatewayRef,
    storedVerifiedRials: storedRials(meta),
  })

  if (decision.action === 'declined') {
    await markDefinitiveDecline(payment, meta, refNum, verified.resultCode, verified.resultDescription)
    fail(true, 'SEP_VERIFY_DECLINED', 402, `SEP verify failed (code=${verified.resultCode})`)
  }

  if (decision.action === 'reject_foreign') {
    fail(false, 'SEP_VERIFY_FOREIGN_REF', 409, 'SEP verify does not match this payment')
  }

  if (decision.action === 'retry_incomplete') {
    await rememberPendingRef(payment.id, {
      ...meta,
      refNum,
      verifyCode: verified.resultCode,
      ...(verified.resNum ? { verifiedResNum: verified.resNum } : {}),
    }, refNum)
    fail(false, 'SEP_VERIFY_INCOMPLETE', 503, 'SEP verify amount missing; retry the callback')
  }

  if (decision.action === 'reverse_ours') {
    await reverseMismatchedCapture(payment, meta, refNum, verified, expectedRials, tid)
  }

  const paidMeta: Record<string, unknown> = {
    ...meta,
    refNum,
    verifyCode: verified.resultCode,
    verifiedAmountRials: expectedRials,
    verifiedResNum: verified.resNum || payment.providerRef,
    gatewayCaptured: true,
    maskedPan: verified.maskedPan,
    traceNo: verified.traceNo,
    confirmedAt: new Date().toISOString(),
  }
  delete paidMeta.verifyPendingRefNum
  return finishPaid(payment, paidMeta, refNum)
}

async function rememberPendingRef(paymentId: string, meta: Record<string, unknown>, refNum: string) {
  await prisma.payment.updateMany({
    where: {
      id: paymentId,
      status: { in: [...PAYABLE] },
      gatewayRef: null,
    },
    data: {
      metadataJson: JSON.stringify({
        ...meta,
        refNum,
        verifyPendingRefNum: refNum,
        verifyPendingAt: new Date().toISOString(),
      }),
    },
  })
}

async function markDefinitiveDecline(
  payment: NonNullable<PaymentRow>,
  meta: Record<string, unknown>,
  refNum: string,
  resultCode: number,
  resultDescription?: string,
) {
  const pending = typeof meta.verifyPendingRefNum === 'string' ? meta.verifyPendingRefNum : ''
  if (pending && pending !== refNum) return
  if (payment.gatewayRef && payment.gatewayRef !== refNum) return
  const next = { ...meta, refNum, verifyCode: resultCode, verifyMessage: resultDescription }
  delete next.verifyPendingRefNum
  await prisma.payment.updateMany({
    where: {
      id: payment.id,
      status: { in: [...PAYABLE] },
      gatewayRef: null,
    },
    data: {
      status: 'FAILED',
      metadataJson: JSON.stringify(next),
    },
  })
}

async function reverseMismatchedCapture(
  payment: NonNullable<PaymentRow>,
  meta: Record<string, unknown>,
  refNum: string,
  verified: { resultCode: number, amount?: number },
  expectedRials: number,
  tid: string,
): Promise<never> {
  const mismatchMeta: Record<string, unknown> = {
    ...meta,
    refNum,
    verifyCode: verified.resultCode,
    gatewayCaptured: true,
    amountMismatch: {
      expectedToman: payment.amount,
      expectedRials,
      gotRials: verified.amount ?? null,
    },
  }
  delete mismatchMeta.verifyPendingRefNum

  try {
    await prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: [...PAYABLE] },
        OR: [{ gatewayRef: null }, { gatewayRef: refNum }],
      },
      data: {
        gatewayRef: refNum,
        metadataJson: JSON.stringify(mismatchMeta),
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      fail(false, 'SEP_REF_IN_USE', 409, 'SEP RefNum already belongs to another payment')
    }
    throw err
  }

  try {
    await sepReverseTransaction({ terminalId: tid, refNum })
  } catch (err) {
    const ambiguous = isReverseAmbiguous(err)
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: [...PAYABLE] }, gatewayRef: refNum },
      data: {
        metadataJson: JSON.stringify({
          ...mismatchMeta,
          reversePending: ambiguous,
          gatewayReversed: false,
          reverseFailReason: err instanceof Error ? err.message : String(err),
        }),
      },
    })
    if (ambiguous) {
      fail(false, 'SEP_REVERSE_AMBIGUOUS', 503, 'SEP reverse incomplete after amount mismatch')
    }
    fail(false, 'SEP_REVERSE_FAILED', 502, 'SEP reverse failed after amount mismatch')
  }

  await prisma.payment.updateMany({
    where: { id: payment.id, status: { in: [...PAYABLE] }, gatewayRef: refNum },
    data: {
      status: 'FAILED',
      metadataJson: JSON.stringify({
        ...mismatchMeta,
        reversePending: false,
        gatewayReversed: true,
        gatewayRefund: true,
        reverseResolvedAt: new Date().toISOString(),
      }),
    },
  })
  fail(true, 'SEP_AMOUNT_MISMATCH', 402, 'SEP verify amount mismatch')
}

function isReverseAmbiguous(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase()
  if (!msg) return true
  if (msg.includes('sep reverse failed')) return false
  return true
}

async function finishPaid(
  payment: NonNullable<PaymentRow>,
  meta: Record<string, unknown>,
  gatewayRef: string | null,
) {
  let outcome: { kind: 'paid' | 'terminal' | 'recollect_failed', payment: NonNullable<PaymentRow> }
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const fresh = await lockPayment(tx, payment.id)
      if (fresh.status === 'PAID') return { kind: 'paid' as const, payment: fresh }
      if (isTerminal(fresh.status) || !PAYABLE.includes(fresh.status as typeof PAYABLE[number])) {
        return { kind: 'terminal' as const, payment: fresh }
      }

      const freshMeta = { ...metaOf(fresh.metadataJson), ...meta }
      const split = readSplitPayMeta(freshMeta)
      if (split?.walletDebitReleased) {
        try {
          await recollectReleasedSplitWallet(fresh.id, tx)
        } catch (err) {
          if (err instanceof SplitRecollectError) {
            return { kind: 'recollect_failed' as const, payment: fresh }
          }
          throw err
        }
        freshMeta.walletDebitReleased = false
        freshMeta.splitRecollectedAt = new Date().toISOString()
      }

      const claimed = await claimPaymentPaid(tx, fresh.id, {
        metadataJson: JSON.stringify(freshMeta),
        gatewayRef,
      })
      if (!claimed.claimed && claimed.payment.status !== 'PAID') {
        return { kind: 'terminal' as const, payment: claimed.payment }
      }
      return { kind: 'paid' as const, payment: claimed.payment }
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      fail(false, 'SEP_REF_IN_USE', 409, 'SEP RefNum already belongs to another payment')
    }
    throw err
  }

  if (outcome.kind === 'recollect_failed') {
    await reverseAfterUnfundedSplit(payment, gatewayRef)
  }
  if (outcome.payment.status === 'REFUNDED' || outcome.payment.status === 'SUPERSEDED') {
    fail(false, 'PAYMENT_NOT_PAYABLE', 409, 'Payment is not payable')
  }
  if (outcome.payment.status !== 'PAID') {
    fail(false, 'PAYMENT_NOT_PAYABLE', 409, 'Payment is not payable')
  }
  return toPaymentIntent(outcome.payment)
}

async function reverseAfterUnfundedSplit(
  payment: NonNullable<PaymentRow>,
  gatewayRef: string | null,
): Promise<never> {
  const tid = terminalId()
  const refNum = gatewayRef || ''
  const meta = metaOf(payment.metadataJson)
  if (!tid || !refNum || isSepSimulatedRef(payment.providerRef || '')) {
    fail(true, 'SPLIT_RECOLLECT_INSUFFICIENT', 409, 'Split wallet share is no longer available')
  }

  // Own the RefNum before reverse so a duplicate row cannot be reversed by mistake.
  try {
    const claimed = await prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: [...PAYABLE] },
        OR: [{ gatewayRef: null }, { gatewayRef: refNum }],
      },
      data: {
        gatewayRef: refNum,
        metadataJson: JSON.stringify({
          ...meta,
          refNum,
          gatewayCaptured: true,
          splitRecollectFailed: true,
        }),
      },
    })
    if (claimed.count !== 1) {
      fail(false, 'PAYMENT_NOT_PAYABLE', 409, 'Payment is not payable')
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      fail(false, 'SEP_REF_IN_USE', 409, 'SEP RefNum already belongs to another payment')
    }
    throw err
  }

  try {
    await sepReverseTransaction({ terminalId: tid, refNum })
  } catch (err) {
    const ambiguous = isReverseAmbiguous(err)
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: [...PAYABLE] }, gatewayRef: refNum },
      data: {
        metadataJson: JSON.stringify({
          ...meta,
          refNum,
          gatewayCaptured: true,
          splitRecollectFailed: true,
          reversePending: ambiguous,
          reverseFailReason: err instanceof Error ? err.message : String(err),
        }),
      },
    })
    if (ambiguous) fail(false, 'SEP_REVERSE_AMBIGUOUS', 503, 'SEP reverse incomplete after split recollect failed')
    fail(false, 'SEP_REVERSE_FAILED', 502, 'SEP reverse failed after split recollect failed')
  }

  await prisma.payment.updateMany({
    where: { id: payment.id, gatewayRef: refNum, status: { in: [...PAYABLE] } },
    data: {
      status: 'FAILED',
      metadataJson: JSON.stringify({
        ...meta,
        refNum,
        gatewayCaptured: true,
        gatewayReversed: true,
        reversePending: false,
        splitRecollectFailed: true,
      }),
    },
  })
  fail(true, 'SPLIT_RECOLLECT_INSUFFICIENT', 409, 'Split wallet share is no longer available')
}
