export function useCheckout() {
  const { public: { paymentsMode } } = useRuntimeConfig()
  const onlineEnabled = computed(() => paymentsMode !== 'pay_at_club')

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
    return ['PENDING_ONLINE', 'PAY_AT_CLUB', 'PENDING_AT_CLUB'].includes(paymentStatus || '')
  }

  /** Wallet debit works in pay_at_club (refund credits) and in online modes. */
  function canPayWithWallet(paymentStatus?: string | null) {
    return ['PENDING_ONLINE', 'PAY_AT_CLUB', 'PENDING_AT_CLUB'].includes(paymentStatus || '')
  }

  function isPaid(paymentStatus?: string | null) {
    return paymentStatus === 'PAID'
  }

  return { onlineEnabled, startCheckout, canPayOnline, canPayWithWallet, isPaid }
}
