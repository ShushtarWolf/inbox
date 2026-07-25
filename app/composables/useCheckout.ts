import { canCoverBookingWithWallet } from '#shared/walletTopUp.ts'

export function useCheckout() {
  const { public: { paymentsMode } } = useRuntimeConfig()
  const onlineEnabled = computed(() => paymentsMode !== 'pay_at_club')
  const isTestPayments = computed(() => paymentsMode === 'test')

  async function startCheckout(body: {
    bookingId?: string
    coachSessionId?: string
    packageBookingId?: string
    useWallet?: boolean
  }) {
    const result = await $fetch<{
      intent: { status: string; redirectUrl?: string }
    }>('/api/payments/checkout', { method: 'POST', body })
    if (result.intent.redirectUrl) {
      await navigateTo(result.intent.redirectUrl, { external: true })
      return result
    }
    return result
  }

  function canPayOnline(paymentStatus?: string | null) {
    if (!onlineEnabled.value) return false
    return ['PENDING_ONLINE', 'PAY_AT_CLUB', 'PENDING_AT_CLUB', 'FAILED'].includes(paymentStatus || '')
  }

  /** Wallet debit works in pay_at_club (refund credits) and in online modes. */
  function canPayWithWallet(paymentStatus?: string | null) {
    return ['PENDING_ONLINE', 'PAY_AT_CLUB', 'PENDING_AT_CLUB', 'FAILED'].includes(paymentStatus || '')
  }

  /** MVP: wallet must cover the full amount — no split with online. */
  function canCoverWithWallet(
    balance: number | null | undefined,
    amount: number | null | undefined,
    paymentStatus?: string | null,
  ) {
    if (!canPayWithWallet(paymentStatus)) return false
    return canCoverBookingWithWallet(Number(balance || 0), Number(amount || 0))
  }

  function isPaid(paymentStatus?: string | null) {
    return paymentStatus === 'PAID'
  }

  return {
    onlineEnabled,
    isTestPayments,
    startCheckout,
    canPayOnline,
    canPayWithWallet,
    canCoverWithWallet,
    isPaid,
  }
}
