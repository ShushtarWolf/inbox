import { canCoverBookingWithWallet } from '#shared/walletTopUp.ts'
import {
  GATEWAY_REDIRECT_STALL_MS,
  gatewayStallError,
  leaveToPaymentGateway,
} from '#shared/paymentRedirect.ts'

export function useCheckout() {
  const { t } = useI18n()
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

  /**
   * Leave for the bank UI without awaiting the destination (TLS/navigateTo can hang).
   * If the document is still here after a few seconds, reject so the CTA can retry.
   */
  function redirectToPaymentGateway(url: string): Promise<never> {
    leaveToPaymentGateway(url)
    return new Promise((_resolve, reject) => {
      window.setTimeout(() => {
        reject(gatewayStallError(t('booking.gatewayRedirectStalled')))
      }, GATEWAY_REDIRECT_STALL_MS)
    })
  }

  async function startCheckout(body: {
    bookingId?: string
    coachSessionId?: string
    packageBookingId?: string
    competitionEntryId?: string
    useWallet?: boolean
  }) {
    const result = await $fetch<{
      intent: { status: string; redirectUrl?: string }
    }>('/api/payments/checkout', { method: 'POST', body })
    if (result.intent.redirectUrl) {
      await redirectToPaymentGateway(result.intent.redirectUrl)
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
    redirectToPaymentGateway,
    canPayOnline,
    canPayWithWallet,
    canCoverWithWallet,
    isPaid,
  }
}
