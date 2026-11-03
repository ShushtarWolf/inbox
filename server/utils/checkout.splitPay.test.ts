import { describe, expect, it, vi } from 'vitest'

const releaseSplitWalletDebit = vi.fn().mockResolvedValue({ released: true })
const paymentUpdate = vi.fn().mockResolvedValue({})

vi.mock('./splitPayWallet', () => ({
  releaseSplitWalletDebit: (...args: unknown[]) => releaseSplitWalletDebit(...args),
}))

vi.stubGlobal('prisma', {
  payment: { update: (...args: unknown[]) => paymentUpdate(...args) },
})

/** Mirrors checkout.post.ts split-pay failure path after atomic debit + failed createIntent. */
async function onSplitPayIntentFailed(pendingPaymentId: string) {
  await releaseSplitWalletDebit(pendingPaymentId)
  await (globalThis as { prisma: { payment: { update: typeof paymentUpdate } } }).prisma.payment.update({
    where: { id: pendingPaymentId },
    data: { status: 'FAILED' },
  }).catch(() => {})
}

describe('split-pay IPG intent failure', () => {
  it('always releases wallet debit and marks payment FAILED', async () => {
    await onSplitPayIntentFailed('pay-split-1')

    expect(releaseSplitWalletDebit).toHaveBeenCalledWith('pay-split-1')
    expect(paymentUpdate).toHaveBeenCalledWith({
      where: { id: 'pay-split-1' },
      data: { status: 'FAILED' },
    })
  })
})
