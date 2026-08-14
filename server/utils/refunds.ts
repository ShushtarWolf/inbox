import { isPaymentRefundable, shouldCreditWalletAfterGatewayRefund } from '#shared/bookingPayment.ts'
import { clawbackOwnerForPayment } from './settlement'
import { creditWallet } from './wallet'
import { syncPaymentToParent } from './paymentSync'
import { getPaymentService } from './payments/service'

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
}): Promise<RefundResult> {
  const payment = await prisma.payment.findUnique({ where: { id: options.paymentId } })
  if (!payment || !isPaymentRefundable(payment.status)) {
    return { refunded: false, walletCredited: false, amount: 0 }
  }

  let walletCredited = false

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
      Boolean(options.userId)
      && (!gatewayRefunded || shouldCreditWalletAfterGatewayRefund(payment))

    if (creditWalletInsteadOfBank && options.userId) {
      try {
        await creditWallet(options.userId, payment.amount, {
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
  } else if (options.userId) {
    try {
      await creditWallet(options.userId, payment.amount, {
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
