import { canCoverBookingWithWallet } from '#shared/walletTopUp.ts'

export function useCheckout() {
  const { public: { paymentsMode: bakedMode } } = useRuntimeConfig()
  const { data: paymentsModePayload } = useFetch<{ mode?: string }>('/api/payments/mode', {
    key: 'payments-mode',
  })
  const paymentsMode = computed(() => {
    const live = paymentsModePayload.value?.mode
    if (live === 'pay_at_club' || live === 'test' || live === 'live') return live
    return bakedMode || 'pay_at_club'
  })
  const onlineEnabled = computed(() => paymentsMode.value !== 'pay_at_club')
  const isTestPayments = computed(() => paymentsMode.value === 'test')

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
