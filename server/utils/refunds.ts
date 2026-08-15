import { isPaymentRefundable, shouldCreditWalletAfterGatewayRefund } from '#shared/bookingPayment.ts'
import { getPaymentService } from './payments/service'
import { syncPaymentToParent } from './paymentSync'
import { prisma } from './prisma'
import { clawbackOwnerForPayment } from './settlement'
import { creditWallet } from './wallet'

export interface RefundResult {
  refunded: boolean
  walletCredited: boolean
  amount: number
}

function isOnlineGatewayPayment(payment: { method: string; provider: string }) {
  return payment.method === 'IPG' && ['log', 'sep', 'idpay'].includes(payment.provider)
}

export async function refundPaymentForCancellation(options: {
  paymentId: string
  userId?: string | null
  reason: string
  bookingId?: string
  skipWallet?: boolean
}): Promise<RefundResult> {
  const payment = await prisma.payment.findUnique({ where: { id: options.paymentId } })
  if (!payment || !isPaymentRefundable(payment.status)) {
    return { refunded: false, walletCredited: false, amount: 0 }
  }

  let walletCredited = false

  const walletUserId = options.skipWallet ? null : options.userId

  if (isOnlineGatewayPayment(payment)) {
    let gatewayRefunded = false
    try {
      const service = getPaymentService(payment.provider)
      await service.refund(payment.id)
      gatewayRefunded = true
    } catch {
      // Live reverse failed (or provider error) — fall back to wallet when possible.
    }

    const creditWalletInsteadOfBank =
      Boolean(walletUserId)
      && (!gatewayRefunded || shouldCreditWalletAfterGatewayRefund(payment))

    if (creditWalletInsteadOfBank && walletUserId) {
      try {
        await creditWallet(walletUserId, payment.amount, {
          paymentId: payment.id,
          bookingId: options.bookingId,
          note: options.reason,
        })
        walletCredited = true
      }
      catch (err) {
        // Soft-fail: gateway may already be REFUNDED; cancel must still succeed.
        console.error('[refunds:creditWallet]', payment.id, err)
      }
    }
  } else if (walletUserId) {
    try {
      await creditWallet(walletUserId, payment.amount, {
        paymentId: payment.id,
        bookingId: options.bookingId,
        note: options.reason,
      })
      walletCredited = true
    }
    catch (err) {
      console.error('[refunds:creditWallet]', payment.id, err)
    }
  } else {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED' },
    })
    await syncPaymentToParent(payment.id)
    try {
      await clawbackOwnerForPayment(payment.id)
    } catch (err) {
      console.error('[refunds:ownerClawback]', payment.id, err)
    }
    return { refunded: true, walletCredited: false, amount: payment.amount }
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: 'REFUNDED' },
  })
  await syncPaymentToParent(payment.id)

  try {
    await clawbackOwnerForPayment(payment.id)
  } catch (err) {
    console.error('[refunds:ownerClawback]', payment.id, err)
  }

  return { refunded: true, walletCredited, amount: payment.amount }
}
